import { findStatInRecord } from "@/lib/data/player-stat-display";
import {
  computeReliabilityFactor,
  statsLookPer90,
} from "@/lib/data/compute-player-performance-score";
import {
  parseTacticalPositionTokens,
  resolveSquadPlayerLineupRole,
} from "@/lib/data/normalize-player-position";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { LAV_BASELINE_SCORE } from "@/lib/prediction/lineup-impact";
import type { GroupMatchPrediction } from "@/lib/world-cup/simulate-group-stage";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import { wcHubRatesFromHistory } from "@/lib/world-cup/international-strength";
import type { ForecastMatchResult } from "@/lib/world-cup/tournament-simulation";
import type { TournamentForecastPayload } from "@/lib/world-cup/tournament-forecast-payload";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import { normalizeText } from "@/lib/soccerdata/normalize";

const PENALTY_TAKER_BOOST = 0.06;
const DOMINANT_SCORER_MULTIPLIER = 1.15;
const TOP_N = 10;
const OPP_EASE_MIN = 0.85;
const OPP_EASE_MAX = 1.15;

export type GoldenBootCandidateFactors = {
  playerQuality: number;
  teamStrength: number;
  pathDepth: number;
  opponentEase: number;
  minutesExpectation: number;
  penaltyRole: boolean;
};

export type GoldenBootCandidate = {
  rank: number;
  playerName: string;
  teamName: string;
  teamId: string;
  position: string;
  fieldPosition: string | null;
  goalsSoFar: number;
  projectedRemainingGoals: number;
  projectedTotalGoals: number;
  expectedMatches: number;
  scoringSharePct: number;
  factors: GoldenBootCandidateFactors;
  /** Current tournament rank by actual goals (not prediction rank). */
  liveTournamentRank?: number | null;
  /** Tied for most goals in the tournament so far. */
  isLiveLeader?: boolean;
};

export type GoldenBootPredictionPayload = {
  computedAt: string;
  /** Set when the predicted top-10 roster is locked for the tournament. */
  frozenAt?: string | null;
  candidates: GoldenBootCandidate[];
  warnings: string[];
  liveLeader?: {
    playerName: string;
    teamId: string;
    goals: number;
  } | null;
};

export type TeamSquadMap = Map<
  string,
  { teamName: string; sofaTeamId: number; squad: TeamSquadSnapshot }
>;

type TeamFixtureGoal = {
  matchId: string;
  isFinished: boolean;
  teamGoals: number;
  oppEase: number;
};

type PlayerWeightEntry = {
  player: SquadPlayer;
  rawWeight: number;
  share: number;
  minutesFactor: number;
  isPenaltyTaker: boolean;
  playerQuality: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNum(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function detailStatsToRecord(
  detailStats: SquadPlayer["detailStats"]
): Record<string, string | number | null> {
  const record: Record<string, string | number | null> = {};
  for (const stat of detailStats) {
    if (!stat.value || stat.value === "—") continue;
    const parsed = parseNum(stat.value);
    record[stat.label] = parsed ?? stat.value;
    if (stat.label === "Goals") record.Goals = parsed ?? stat.value;
    if (stat.label === "xG") record.xG = parsed ?? stat.value;
    if (stat.label === "Minutes") record.Minutes = parsed ?? stat.value;
    if (stat.label === "Appearances") record.Apps = parsed ?? stat.value;
  }
  return record;
}

function getMinutes(stats: Record<string, string | number | null>): number | null {
  return parseNum(findStatInRecord(stats, ["Min", "Minutes", "minutes", "Mins"]));
}

function per90(
  stats: Record<string, string | number | null>,
  suffixes: string[]
): number | null {
  const raw = parseNum(findStatInRecord(stats, suffixes));
  if (raw == null) return null;
  const alreadyPer90 = statsLookPer90(stats);
  if (alreadyPer90) return raw;
  const minutes = getMinutes(stats);
  if (minutes == null || minutes <= 0) return null;
  return (raw / minutes) * 90;
}

function performanceToNpxGProxy(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0.08;
  const normalized = (score - LAV_BASELINE_SCORE) / 100;
  return clamp(0.08 + normalized * 0.35, 0.02, 0.55);
}

function positionScoringMultiplier(fieldPosition: string | null, role: "G" | "D" | "M" | "F"): number {
  const tokens = parseTacticalPositionTokens(fieldPosition);
  const slot = (tokens[0] ?? fieldPosition ?? "").toUpperCase();
  if (slot === "ST" || slot === "CF" || slot === "LS" || slot === "RS") return 1.0;
  if (slot === "LW" || slot === "RW" || slot === "LF" || slot === "RF") return 0.85;
  if (slot === "CAM" || slot === "AM") return 0.72;
  if (role === "F") return 0.9;
  if (role === "M") return 0.72;
  return 0;
}

export function isGoldenBootCandidate(player: SquadPlayer): boolean {
  const role = resolveSquadPlayerLineupRole({
    fieldPosition: player.fieldPosition,
    position: player.position,
  });
  if (role === "F") return true;
  if (role !== "M") return false;
  const tokens = parseTacticalPositionTokens(player.fieldPosition ?? player.position);
  return tokens.some((t) => /^(LW|RW|CAM|AM|LS|RS|ST|CF|SS)$/.test(t));
}

function namesMatch(playerName: string, penaltyTakerName: string | null | undefined): boolean {
  if (!penaltyTakerName) return false;
  const playerKeys = new Set(playerNameLookupKeys(playerName).map(normalizeText));
  const takerKeys = playerNameLookupKeys(penaltyTakerName).map(normalizeText);
  return takerKeys.some((key) => playerKeys.has(key));
}

export function computePlayerScoringWeight(
  player: SquadPlayer,
  options?: { isPenaltyTaker?: boolean }
): { rawWeight: number; minutesFactor: number; playerQuality: number } {
  const role = resolveSquadPlayerLineupRole({
    fieldPosition: player.fieldPosition,
    position: player.position,
  });
  const stats = detailStatsToRecord(player.detailStats);
  const minutes = getMinutes(stats) ?? 0;
  const reliability = computeReliabilityFactor(Math.max(minutes, 90));
  const posMult = positionScoringMultiplier(player.fieldPosition, role);

  let baseRate = 0;
  if (role === "F" || role === "M") {
    baseRate =
      per90(stats, ["npxG", "npxg"]) ??
      per90(stats, ["xG", "Expected goals", "xG/90"]) ??
      per90(stats, ["Gls", "Goals", "goals"]) ??
      performanceToNpxGProxy(player.performanceScore);
  }

  const minutesFactor =
    player.startSharePct != null
      ? clamp(player.startSharePct / 100, 0.2, 1)
      : player.performanceScore != null && player.performanceScore >= 70
        ? 0.92
        : 0.35;

  let rawWeight = baseRate * 0.85 * reliability * posMult * minutesFactor;
  if (rawWeight <= 0 && player.performanceScore != null) {
    rawWeight =
      performanceToNpxGProxy(player.performanceScore) * posMult * minutesFactor * reliability;
  }

  if (options?.isPenaltyTaker) {
    rawWeight *= 1.12;
  }

  const playerQuality = clamp(
    (player.performanceScore ?? LAV_BASELINE_SCORE) * (baseRate > 0 ? 1.05 : 0.85),
    0,
    100
  );

  return { rawWeight: Math.max(rawWeight, 0.001), minutesFactor, playerQuality };
}

function computePlayerWeights(
  squad: TeamSquadSnapshot,
  penaltyTakerName: string | null
): PlayerWeightEntry[] {
  const roster = [...squad.starters, ...squad.substitutes].filter(isGoldenBootCandidate);
  if (!roster.length) return [];

  const likelyXi = [...roster]
    .sort((a, b) => (b.startSharePct ?? 0) - (a.startSharePct ?? 0))
    .slice(0, 11);

  const xiSet = new Set(likelyXi.map((p) => p.name));

  const entries: PlayerWeightEntry[] = roster
    .filter((p) => xiSet.has(p.name))
    .map((player) => {
      const isPenaltyTaker = namesMatch(player.name, penaltyTakerName);
      const { rawWeight, minutesFactor, playerQuality } = computePlayerScoringWeight(player, {
        isPenaltyTaker,
      });
      return {
        player,
        rawWeight,
        share: 0,
        minutesFactor,
        isPenaltyTaker,
        playerQuality,
      };
    });

  const goalsPer90 = entries.map((e) => {
    const stats = detailStatsToRecord(e.player.detailStats);
    return per90(stats, ["Gls", "Goals", "goals"]) ?? 0;
  });
  const maxGoals = Math.max(...goalsPer90, 0);
  const secondMax = goalsPer90.filter((g) => g < maxGoals).sort((a, b) => b - a)[0] ?? 0;
  if (maxGoals > 0 && maxGoals >= secondMax * 2) {
    const dominantIdx = goalsPer90.indexOf(maxGoals);
    if (dominantIdx >= 0) {
      entries[dominantIdx].rawWeight *= DOMINANT_SCORER_MULTIPLIER;
    }
  }

  const total = entries.reduce((sum, e) => sum + e.rawWeight, 0);
  if (total <= 0) return [];

  for (const entry of entries) {
    entry.share = entry.rawWeight / total;
  }
  return entries;
}

function isFinishedMatch(m: WcMatchRow): boolean {
  return m.status === "finished" || (m.home_goals != null && m.away_goals != null);
}

function computeMedianDefense(
  teamNames: Map<string, string>,
  finishedMatches: WcMatchRow[]
): number {
  const defenses: number[] = [];
  for (const [teamId, name] of teamNames) {
    const teamFinished = finishedMatches.filter(
      (m) => m.home_team_id === teamId || m.away_team_id === teamId
    );
    const rates = wcHubRatesFromHistory(teamId, teamFinished, name);
    if (Number.isFinite(rates.defense) && rates.defense > 0) {
      defenses.push(rates.defense);
    }
  }
  if (!defenses.length) return 1;
  defenses.sort((a, b) => a - b);
  return defenses[Math.floor(defenses.length / 2)] ?? 1;
}

function opponentEase(
  opponentId: string,
  opponentName: string,
  finishedMatches: WcMatchRow[],
  medianDefense: number
): number {
  const oppFinished = finishedMatches.filter(
    (m) => m.home_team_id === opponentId || m.away_team_id === opponentId
  );
  const rates = wcHubRatesFromHistory(opponentId, oppFinished, opponentName);
  const defense = rates.defense > 0 ? rates.defense : medianDefense;
  return clamp(medianDefense / defense, OPP_EASE_MIN, OPP_EASE_MAX);
}

export function buildTeamFixtureGoals(input: {
  teamId: string;
  teamName: string;
  groupMatches: WcMatchRow[];
  knockoutMatches: ForecastMatchResult[];
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  finishedMatches: WcMatchRow[];
  medianDefense: number;
}): TeamFixtureGoal[] {
  const fixtures: TeamFixtureGoal[] = [];

  for (const m of input.groupMatches) {
    const isHome = m.home_team_id === input.teamId;
    const isAway = m.away_team_id === input.teamId;
    if (!isHome && !isAway) continue;

    const oppId = isHome ? m.away_team_id! : m.home_team_id!;
    const oppName = isHome ? (m.away_team_name ?? "Away") : (m.home_team_name ?? "Home");
    const finished = isFinishedMatch(m);

    let teamGoals: number;
    if (finished) {
      teamGoals = isHome ? (m.home_goals ?? 0) : (m.away_goals ?? 0);
    } else {
      const pred = input.predictionsByMatchId.get(m.id);
      if (pred?.homeXg != null && pred?.awayXg != null) {
        teamGoals = isHome ? pred.homeXg : pred.awayXg;
      } else if (pred) {
        teamGoals = isHome ? pred.predicted_score_home : pred.predicted_score_away;
      } else {
        teamGoals = 1;
      }
    }

    const ease = finished
      ? 1
      : opponentEase(oppId, oppName, input.finishedMatches, input.medianDefense);

    fixtures.push({
      matchId: m.id,
      isFinished: finished,
      teamGoals: teamGoals * ease,
      oppEase: ease,
    });
  }

  for (const m of input.knockoutMatches) {
    const isHome = m.homeTeam.teamId === input.teamId;
    const isAway = m.awayTeam.teamId === input.teamId;
    if (!isHome && !isAway) continue;

    const oppId = isHome ? m.awayTeam.teamId : m.homeTeam.teamId;
    const oppName = isHome ? m.awayTeam.teamName : m.homeTeam.teamName;
    const teamGoals = isHome ? m.homeGoals : m.awayGoals;
    const ease = opponentEase(
      oppId,
      oppName,
      input.finishedMatches,
      input.medianDefense
    );

    fixtures.push({
      matchId: `ko-${m.matchNumber}`,
      isFinished: false,
      teamGoals: teamGoals * ease,
      oppEase: ease,
    });
  }

  return fixtures;
}

export function allocateTeamGoalsToPlayers(input: {
  teamId: string;
  teamName: string;
  squad: TeamSquadSnapshot;
  fixtures: TeamFixtureGoal[];
  penaltyTakerName: string | null;
  goalsByPlayer?: Map<string, number>;
  teamAttackRate?: number;
}): GoldenBootCandidate[] {
  const weights = computePlayerWeights(input.squad, input.penaltyTakerName);
  if (!weights.length) return [];

  const remainingGoals = input.fixtures
    .filter((f) => !f.isFinished)
    .reduce((sum, f) => sum + f.teamGoals, 0);

  const avgOppEase =
    input.fixtures.length > 0
      ? input.fixtures.reduce((sum, f) => sum + f.oppEase, 0) / input.fixtures.length
      : 1;

  const teamAttack = input.teamAttackRate ?? 1;
  const expectedMatches = input.fixtures.length;
  const pathDepth = clamp(expectedMatches / 7, 0, 1);

  const results: GoldenBootCandidate[] = [];

  for (const entry of weights) {
    const goalsSoFar = input.goalsByPlayer?.get(entry.player.name) ?? 0;
    const remainingShare = remainingGoals * entry.share;
    const penaltyBoost = entry.isPenaltyTaker ? PENALTY_TAKER_BOOST : 0;
    const projectedRemainingGoals = remainingShare + penaltyBoost;
    const projectedTotalGoals = goalsSoFar + projectedRemainingGoals;

    results.push({
      rank: 0,
      playerName: entry.player.name,
      teamName: input.teamName,
      teamId: input.teamId,
      position: entry.player.position,
      fieldPosition: entry.player.fieldPosition,
      goalsSoFar,
      projectedRemainingGoals,
      projectedTotalGoals,
      expectedMatches,
      scoringSharePct: Math.round(entry.share * 1000) / 10,
      factors: {
        playerQuality: Math.round(entry.playerQuality),
        teamStrength: Math.round(teamAttack * 100) / 100,
        pathDepth: Math.round(pathDepth * 100) / 100,
        opponentEase: Math.round(avgOppEase * 100) / 100,
        minutesExpectation: Math.round(entry.minutesFactor * 100) / 100,
        penaltyRole: entry.isPenaltyTaker,
      },
    });
  }

  return results;
}

export function rankGoldenBootCandidates(
  candidates: GoldenBootCandidate[],
  limit = TOP_N
): GoldenBootCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.projectedTotalGoals !== a.projectedTotalGoals) {
      return b.projectedTotalGoals - a.projectedTotalGoals;
    }
    if (b.factors.playerQuality !== a.factors.playerQuality) {
      return b.factors.playerQuality - a.factors.playerQuality;
    }
    return a.playerName.localeCompare(b.playerName);
  });

  return sorted.slice(0, limit).map((c, idx) => ({ ...c, rank: idx + 1 }));
}

export function computeGoldenBootPredictions(input: {
  forecast: TournamentForecastPayload;
  groupMatches: WcMatchRow[];
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  teamNames: Map<string, string>;
  squads: TeamSquadMap;
  penaltyTakersByTeamName: Map<string, string | null>;
  goalsByPlayerTeam?: Map<string, Map<string, number>>;
}): GoldenBootPredictionPayload {
  const warnings: string[] = [];
  const finishedMatches = input.groupMatches.filter(isFinishedMatch);
  const medianDefense = computeMedianDefense(input.teamNames, finishedMatches);

  const allCandidates: GoldenBootCandidate[] = [];

  for (const [teamId, { teamName, squad }] of input.squads) {
    if (!squad.starters.length && !squad.substitutes.length) {
      warnings.push(`No squad data for ${teamName}`);
      continue;
    }

    const teamGroupMatches = input.groupMatches.filter(
      (m) => m.home_team_id === teamId || m.away_team_id === teamId
    );
    const teamKnockout = input.forecast.knockoutMatches.filter(
      (m) => m.homeTeam.teamId === teamId || m.awayTeam.teamId === teamId
    );

    const fixtures = buildTeamFixtureGoals({
      teamId,
      teamName,
      groupMatches: teamGroupMatches,
      knockoutMatches: teamKnockout,
      predictionsByMatchId: input.predictionsByMatchId,
      finishedMatches,
      medianDefense,
    });

    if (!fixtures.length) continue;

    const teamFinished = finishedMatches.filter(
      (m) => m.home_team_id === teamId || m.away_team_id === teamId
    );
    const attackRate = wcHubRatesFromHistory(teamId, teamFinished, teamName).attack;

    const penaltyKey = [...input.penaltyTakersByTeamName.entries()].find(
      ([name]) => normalizeText(name) === normalizeText(teamName)
    )?.[1] ?? null;

    const teamCandidates = allocateTeamGoalsToPlayers({
      teamId,
      teamName,
      squad,
      fixtures,
      penaltyTakerName: penaltyKey,
      goalsByPlayer: input.goalsByPlayerTeam?.get(teamId),
      teamAttackRate: attackRate,
    });

    allCandidates.push(...teamCandidates);
  }

  if (!allCandidates.length) {
    warnings.push("No golden boot candidates could be ranked");
  }

  return {
    computedAt: new Date().toISOString(),
    candidates: rankGoldenBootCandidates(allCandidates),
    warnings,
  };
}
