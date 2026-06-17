import {
  ensureFifaRankingsLoaded,
  getLatestFifaRankingForTeam,
} from "@/lib/data/fifa-rankings-store";
import { sampleScoreFromXg } from "@/lib/prediction/tournament-sim";
import {
  getKnockoutRoundOrder,
  loadKnockoutBracket,
  resolveKnockoutMatch,
  type KnockoutBracketMatchDef,
  type TeamRef,
} from "@/lib/world-cup/knockout-bracket";
import {
  resolveKnockoutMatchOutcome,
  resolveKnockoutMatchOutcomeQuick,
  resolveQuickNeutralXg,
} from "@/lib/world-cup/knockout-match";
import {
  simulateGroupStage,
  type GroupMatchPrediction,
  type SimulatedGroupStageResult,
} from "@/lib/world-cup/simulate-group-stage";
import type { MonteCarloSummary, MonteCarloTeamStats } from "@/lib/world-cup/tournament-forecast-payload";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export type ForecastMatchResult = {
  matchNumber: number;
  round: KnockoutBracketMatchDef["round"] | "GS";
  date: string | null;
  kickoffTime: string | null;
  city: string | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  homeGoals: number;
  awayGoals: number;
  winner: TeamRef;
  decidedBy?: "regulation" | "extra_time" | "penalties";
};

export type TournamentForecast = {
  mode: "deterministic";
  computedAt: string;
  allocationKey: string | null;
  champion: TeamRef;
  runnerUp: TeamRef;
  thirdPlace: TeamRef;
  semiFinalists: [TeamRef, TeamRef];
  warnings: string[];
  groupStage: SimulatedGroupStageResult;
  groupMatches: ForecastMatchResult[];
  knockoutMatches: ForecastMatchResult[];
};

export type TournamentForecastInput = {
  matches: WcMatchRow[];
  teamNames: Map<string, string>;
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  fairPlayByTeam?: Map<string, number>;
  /** hub = full predict API per tie; quick = FIFA xG (page load) */
  knockoutMode?: "hub" | "quick";
};

export async function runDeterministicTournamentForecast(
  input: TournamentForecastInput
): Promise<TournamentForecast | null> {
  const knockoutMode = input.knockoutMode ?? "hub";
  const groupStage = simulateGroupStage(input);
  const { knockoutProjection, groupMatrix, matches: simMatches, warnings } = groupStage;

  if (!knockoutProjection.allocationFound || !knockoutProjection.lookupKey) {
    warnings.push("Knockout allocation matrix not resolved for simulated third-place set");
    return null;
  }

  const groupMatches: ForecastMatchResult[] = simMatches
    .filter((m) => m.home_goals != null && m.away_goals != null)
    .map((m) => {
      const home: TeamRef = {
        teamId: m.home_team_id!,
        teamName: m.home_team_name ?? "Home",
      };
      const away: TeamRef = {
        teamId: m.away_team_id!,
        teamName: m.away_team_name ?? "Away",
      };
      const homeGoals = m.home_goals!;
      const awayGoals = m.away_goals!;
      const winner =
        homeGoals > awayGoals ? home : awayGoals > homeGoals ? away : home;
      return {
        matchNumber: 0,
        round: "GS" as const,
        date: m.date,
        kickoffTime: m.time ?? null,
        city: m.venue_city ?? null,
        homeTeam: home,
        awayTeam: away,
        homeGoals,
        awayGoals,
        winner,
        decidedBy: "regulation" as const,
      };
    });

  const winners = new Map<number, TeamRef>();
  const losers = new Map<number, TeamRef>();
  const knockoutMatches: ForecastMatchResult[] = [];
  const bracket = loadKnockoutBracket();
  const slotAssignments = knockoutProjection.slotAssignments;

  for (const round of getKnockoutRoundOrder()) {
    const roundDefs = bracket.filter((m) => m.round === round);
    const resolvedRound: Array<{
      def: KnockoutBracketMatchDef;
      resolved: NonNullable<ReturnType<typeof resolveKnockoutMatch>>;
    }> = [];

    for (const def of roundDefs) {
      const resolved = resolveKnockoutMatch(
        def,
        groupMatrix,
        slotAssignments,
        winners,
        losers
      );
      if (!resolved) {
        warnings.push(`Could not resolve knockout match ${def.match_number} (${round})`);
        continue;
      }
      resolvedRound.push({ def, resolved });
    }

    const outcomes = await Promise.all(
      resolvedRound.map(async ({ def, resolved }) => {
        const outcome =
          knockoutMode === "quick"
            ? resolveKnockoutMatchOutcomeQuick(def, resolved)
            : await resolveKnockoutMatchOutcome(def, resolved, {
                finishedMatches: simMatches,
              });
        return { def, resolved, outcome };
      })
    );

    for (const { def, resolved, outcome } of outcomes) {
      if (!outcome) {
        warnings.push(`Could not predict knockout match ${def.match_number}`);
        continue;
      }

      winners.set(def.match_number, outcome.winner);
      losers.set(def.match_number, outcome.loser);

      knockoutMatches.push({
        matchNumber: def.match_number,
        round: def.round,
        date: def.date,
        kickoffTime: def.kickoff_time,
        city: def.city,
        homeTeam: {
          teamId: resolved.homeTeam.teamId,
          teamName: resolved.homeTeam.teamName,
        },
        awayTeam: {
          teamId: resolved.awayTeam.teamId,
          teamName: resolved.awayTeam.teamName,
        },
        homeGoals: outcome.homeGoals,
        awayGoals: outcome.awayGoals,
        winner: outcome.winner,
        decidedBy: outcome.decidedBy,
      });
    }
  }

  const final = knockoutMatches.find((m) => m.round === "F");
  const third = knockoutMatches.find((m) => m.round === "3P");
  const sf = knockoutMatches.filter((m) => m.round === "SF");

  if (!final || !third || sf.length !== 2) {
    warnings.push("Incomplete knockout bracket resolution");
    return null;
  }

  return {
    mode: "deterministic",
    computedAt: new Date().toISOString(),
    allocationKey: knockoutProjection.lookupKey,
    champion: final.winner,
    runnerUp: final.winner.teamId === final.homeTeam.teamId ? final.awayTeam : final.homeTeam,
    thirdPlace: third.winner,
    semiFinalists: [sf[0].winner, sf[1].winner],
    warnings,
    groupStage,
    groupMatches,
    knockoutMatches,
  };
}

function resolveKnockoutWinnerSampled(
  home: TeamRef,
  away: TeamRef,
  homeXg: number,
  awayXg: number
): { winner: TeamRef; loser: TeamRef } {
  let scored = sampleScoreFromXg(homeXg, awayXg);
  if (scored.home !== scored.away) {
    return scored.home > scored.away
      ? { winner: home, loser: away }
      : { winner: away, loser: home };
  }
  scored = sampleScoreFromXg(homeXg * 0.3, awayXg * 0.3);
  if (scored.home !== scored.away) {
    return scored.home > scored.away
      ? { winner: home, loser: away }
      : { winner: away, loser: home };
  }
  const homeRank = getLatestFifaRankingForTeam(home.teamName)?.rank ?? 999;
  const awayRank = getLatestFifaRankingForTeam(away.teamName)?.rank ?? 999;
  return homeRank <= awayRank
    ? { winner: home, loser: away }
    : { winner: away, loser: home };
}

function simulateKnockoutBracketSampled(
  groupMatrix: SimulatedGroupStageResult["groupMatrix"],
  slotAssignments: Record<string, string>
): { champion: TeamRef; finalistIds: Set<string>; semiIds: Set<string> } | null {
  const winners = new Map<number, TeamRef>();
  const losers = new Map<number, TeamRef>();
  const bracket = loadKnockoutBracket();
  const finalistIds = new Set<string>();
  const semiIds = new Set<string>();

  for (const round of getKnockoutRoundOrder()) {
    for (const def of bracket.filter((m) => m.round === round)) {
      const resolved = resolveKnockoutMatch(
        def,
        groupMatrix,
        slotAssignments,
        winners,
        losers
      );
      if (!resolved) return null;

      const home = {
        teamId: resolved.homeTeam.teamId,
        teamName: resolved.homeTeam.teamName,
      };
      const away = {
        teamId: resolved.awayTeam.teamId,
        teamName: resolved.awayTeam.teamName,
      };
      const xg = resolveQuickNeutralXg(home.teamName, away.teamName);
      const { winner, loser } = resolveKnockoutWinnerSampled(
        home,
        away,
        xg.homeXg,
        xg.awayXg
      );
      winners.set(def.match_number, winner);
      losers.set(def.match_number, loser);

      if (round === "SF") {
        semiIds.add(winner.teamId);
        finalistIds.add(winner.teamId);
      }
      if (round === "F") {
        return { champion: winner, finalistIds, semiIds };
      }
    }
  }
  return null;
}

/**
 * Monte Carlo advancement probabilities (group sampling from xG, knockout from FIFA-anchored xG).
 */
export async function runMonteCarloTournamentForecast(input: {
  matches: WcMatchRow[];
  teamNames: Map<string, string>;
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  fairPlayByTeam?: Map<string, number>;
  iterations?: number;
}): Promise<MonteCarloSummary> {
  await ensureFifaRankingsLoaded();
  const iterations = Math.min(5000, Math.max(100, input.iterations ?? 2000));

  const winCount = new Map<string, number>();
  const finalCount = new Map<string, number>();
  const semiCount = new Map<string, number>();

  for (let i = 0; i < iterations; i++) {
    const sampledPreds = new Map<string, GroupMatchPrediction>();
    for (const m of input.matches) {
      if (
        m.status === "finished" ||
        (m.home_goals != null && m.away_goals != null)
      ) {
        continue;
      }
      const base = input.predictionsByMatchId.get(m.id);
      if (!base) continue;
      const homeXg = base.homeXg ?? 1.2;
      const awayXg = base.awayXg ?? 1.2;
      const scored = sampleScoreFromXg(homeXg, awayXg);
      sampledPreds.set(m.id, {
        predicted_score_home: scored.home,
        predicted_score_away: scored.away,
        homeXg,
        awayXg,
      });
    }

    const groupStage = simulateGroupStage({
      matches: input.matches,
      teamNames: input.teamNames,
      predictionsByMatchId: new Map([
        ...input.predictionsByMatchId,
        ...sampledPreds,
      ]),
      fairPlayByTeam: input.fairPlayByTeam,
    });

    if (!groupStage.knockoutProjection.allocationFound) continue;

    const outcome = simulateKnockoutBracketSampled(
      groupStage.groupMatrix,
      groupStage.knockoutProjection.slotAssignments
    );
    if (!outcome) continue;

    winCount.set(
      outcome.champion.teamId,
      (winCount.get(outcome.champion.teamId) ?? 0) + 1
    );
    for (const id of outcome.finalistIds) {
      finalCount.set(id, (finalCount.get(id) ?? 0) + 1);
    }
    for (const id of outcome.semiIds) {
      semiCount.set(id, (semiCount.get(id) ?? 0) + 1);
    }
  }

  const teams: MonteCarloTeamStats[] = [];
  for (const [teamId, name] of input.teamNames) {
    teams.push({
      teamId,
      teamName: name,
      winPct: ((winCount.get(teamId) ?? 0) / iterations) * 100,
      finalPct: ((finalCount.get(teamId) ?? 0) / iterations) * 100,
      semiPct: ((semiCount.get(teamId) ?? 0) / iterations) * 100,
    });
  }
  teams.sort((a, b) => b.winPct - a.winPct);

  return { iterations, teams };
}
