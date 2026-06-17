import {
  ensureFifaRankingsLoaded,
  getLatestFifaRankingForTeam,
} from "@/lib/data/fifa-rankings-store";
import { mostLikelyScoreFromXg } from "@/lib/prediction/tournament-sim";
import { runHubMainPredict } from "@/lib/world-cup/hub-main-predict";
import type { TeamRef } from "@/lib/world-cup/knockout-bracket";
import type { KnockoutBracketMatchDef } from "@/lib/world-cup/knockout-bracket";
import type { ResolvedKnockoutMatch } from "@/lib/world-cup/knockout-bracket";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export type KnockoutMatchOutcome = {
  matchNumber: number;
  homeGoals: number;
  awayGoals: number;
  winner: TeamRef;
  loser: TeamRef;
  decidedBy: "regulation" | "extra_time" | "penalties";
  homeXg?: number;
  awayXg?: number;
};

function toWcMatchRow(
  def: KnockoutBracketMatchDef,
  resolved: ResolvedKnockoutMatch
): WcMatchRow {
  return {
    id: `ko-${def.match_number}`,
    date: def.date,
    time: def.kickoff_time,
    group_code: null,
    status: "scheduled",
    home_team_id: resolved.homeTeam.teamId,
    away_team_id: resolved.awayTeam.teamId,
    home_team_name: resolved.homeTeam.teamName,
    away_team_name: resolved.awayTeam.teamName,
    home_goals: null,
    away_goals: null,
    venue_city: def.city,
    venue: def.stadium,
  };
}

function pickPenaltyWinner(home: TeamRef, away: TeamRef): TeamRef {
  const homeRank = getLatestFifaRankingForTeam(home.teamName)?.rank ?? 999;
  const awayRank = getLatestFifaRankingForTeam(away.teamName)?.rank ?? 999;
  if (homeRank <= awayRank) return home;
  return away;
}

function resolveWinnerFromScores(
  home: TeamRef,
  away: TeamRef,
  homeGoals: number,
  awayGoals: number,
  decidedBy: KnockoutMatchOutcome["decidedBy"]
): { winner: TeamRef; loser: TeamRef; decidedBy: KnockoutMatchOutcome["decidedBy"] } {
  if (homeGoals > awayGoals) {
    return { winner: home, loser: away, decidedBy };
  }
  return { winner: away, loser: home, decidedBy };
}

/**
 * Deterministic knockout tie: hub predict score → ET (30% xG) → FIFA-rank penalties.
 */
export async function resolveKnockoutMatchOutcome(
  def: KnockoutBracketMatchDef,
  resolved: ResolvedKnockoutMatch,
  options?: { finishedMatches?: WcMatchRow[] }
): Promise<KnockoutMatchOutcome | null> {
  await ensureFifaRankingsLoaded();

  const home: TeamRef = {
    teamId: resolved.homeTeam.teamId,
    teamName: resolved.homeTeam.teamName,
  };
  const away: TeamRef = {
    teamId: resolved.awayTeam.teamId,
    teamName: resolved.awayTeam.teamName,
  };

  const matchRow = toWcMatchRow(def, resolved);
  const pred = await runHubMainPredict(matchRow, {
    finishedMatches: options?.finishedMatches,
  });
  if (!pred) return null;

  const homeXg = pred.snapshot.home_xg as number ?? pred.snapshot.lambda as number ?? 1;
  const awayXg = pred.snapshot.away_xg as number ?? pred.snapshot.mu as number ?? 1;
  let homeGoals = pred.predicted_score_home;
  let awayGoals = pred.predicted_score_away;

  if (homeGoals !== awayGoals) {
    const { winner, loser, decidedBy } = resolveWinnerFromScores(
      home,
      away,
      homeGoals,
      awayGoals,
      "regulation"
    );
    return {
      matchNumber: def.match_number,
      homeGoals,
      awayGoals,
      winner,
      loser,
      decidedBy,
      homeXg,
      awayXg,
    };
  }

  const etHomeXg = homeXg * 0.3;
  const etAwayXg = awayXg * 0.3;
  const etHomeGoals = Math.round(etHomeXg);
  const etAwayGoals = Math.round(etAwayXg);
  homeGoals += etHomeGoals;
  awayGoals += etAwayGoals;

  if (homeGoals !== awayGoals) {
    const { winner, loser, decidedBy } = resolveWinnerFromScores(
      home,
      away,
      homeGoals,
      awayGoals,
      "extra_time"
    );
    return {
      matchNumber: def.match_number,
      homeGoals,
      awayGoals,
      winner,
      loser,
      decidedBy,
      homeXg,
      awayXg,
    };
  }

  const winner = pickPenaltyWinner(home, away);
  const loser = winner.teamId === home.teamId ? away : home;
  return {
    matchNumber: def.match_number,
    homeGoals,
    awayGoals,
    winner,
    loser,
    decidedBy: "penalties",
    homeXg,
    awayXg,
  };
}

export function resolveQuickNeutralXg(
  homeName: string,
  awayName: string
): { homeXg: number; awayXg: number } {
  const homePts = getLatestFifaRankingForTeam(homeName)?.points ?? 1500;
  const awayPts = getLatestFifaRankingForTeam(awayName)?.points ?? 1500;
  const ratio = homePts / Math.max(awayPts, 1);
  const base = 1.25;
  return {
    homeXg: base * Math.pow(ratio, 0.35),
    awayXg: base * Math.pow(1 / ratio, 0.35),
  };
}

/**
 * Fast deterministic knockout (FIFA xG, no API) — used for hub page render.
 */
export function resolveKnockoutMatchOutcomeQuick(
  def: KnockoutBracketMatchDef,
  resolved: ResolvedKnockoutMatch
): KnockoutMatchOutcome {
  const home: TeamRef = {
    teamId: resolved.homeTeam.teamId,
    teamName: resolved.homeTeam.teamName,
  };
  const away: TeamRef = {
    teamId: resolved.awayTeam.teamId,
    teamName: resolved.awayTeam.teamName,
  };

  const { homeXg, awayXg } = resolveQuickNeutralXg(home.teamName, away.teamName);
  const regulation = mostLikelyScoreFromXg(homeXg, awayXg, { avoidDraw: true });
  let homeGoals = regulation.home;
  let awayGoals = regulation.away;

  if (homeGoals !== awayGoals) {
    const { winner, loser, decidedBy } = resolveWinnerFromScores(
      home,
      away,
      homeGoals,
      awayGoals,
      "regulation"
    );
    return {
      matchNumber: def.match_number,
      homeGoals,
      awayGoals,
      winner,
      loser,
      decidedBy,
      homeXg,
      awayXg,
    };
  }

  const extraTime = mostLikelyScoreFromXg(homeXg * 0.3, awayXg * 0.3, { avoidDraw: true });
  homeGoals += extraTime.home;
  awayGoals += extraTime.away;

  if (homeGoals !== awayGoals) {
    const { winner, loser, decidedBy } = resolveWinnerFromScores(
      home,
      away,
      homeGoals,
      awayGoals,
      "extra_time"
    );
    return {
      matchNumber: def.match_number,
      homeGoals,
      awayGoals,
      winner,
      loser,
      decidedBy,
      homeXg,
      awayXg,
    };
  }

  const winner = pickPenaltyWinner(home, away);
  const loser = winner.teamId === home.teamId ? away : home;
  return {
    matchNumber: def.match_number,
    homeGoals,
    awayGoals,
    winner,
    loser,
    decidedBy: "penalties",
    homeXg,
    awayXg,
  };
}
