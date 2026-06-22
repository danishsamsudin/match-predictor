import { findStatInRecord } from "@/lib/data/player-stat-display";
import {
  statsLookPer90,
} from "@/lib/data/compute-player-performance-score";
import {
  parseTacticalPositionTokens,
  resolveSquadPlayerLineupRole,
} from "@/lib/data/normalize-player-position";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { LAV_BASELINE_SCORE } from "@/lib/prediction/lineup-impact";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { ShotProfile } from "@/lib/world-cup/graham-shot-profiles";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";

const TOP_N = 5;
const TEAM_GOAL_SHARE = 0.85;
const TEAM_ASSIST_BUDGET_RATIO = 0.55;
const PENALTY_TAKER_GOAL_BUMP = 0.15;
const MIN_SUM_BASE = 0.1;

export type PlayerPropMarket = "anytime_scorer" | "goal_or_assist";

export type PlayerPropLine = {
  rank: number;
  playerName: string;
  position: string;
  fieldPosition: string | null;
  expectedGoals: number;
  expectedAssists: number;
  probabilityPct: number;
  fairDecimalOdds: number;
  isPenaltyTaker: boolean;
  tacticalMultiplier: number;
};

export type TeamPlayerPropsSide = {
  teamName: string;
  teamId: number;
  teamExpectedGoals: number;
  anytimeScorer: PlayerPropLine[];
  goalOrAssist: PlayerPropLine[];
};

export type PlayerPropsPayload = {
  computedAt: string;
  modelVersion: string;
  home: TeamPlayerPropsSide;
  away: TeamPlayerPropsSide;
  warnings: string[];
};

type PlayerPropCandidate = {
  player: SquadPlayer;
  baseGoalLambda: number;
  baseAssistLambda: number;
  tacticalMultiplier: number;
  normalizedGoalLambda: number;
  normalizedAssistLambda: number;
  isPenaltyTaker: boolean;
  anytimeProb: number;
  goalOrAssistProb: number;
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
  if (statsLookPer90(stats)) return raw;
  const minutes = getMinutes(stats);
  if (minutes == null || minutes <= 0) return null;
  return (raw / minutes) * 90;
}

function performanceToNpxGProxy(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0.08;
  const normalized = (score - LAV_BASELINE_SCORE) / 100;
  return clamp(0.08 + normalized * 0.35, 0.02, 0.55);
}

function performanceToXAProxy(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0.06;
  const normalized = (score - LAV_BASELINE_SCORE) / 100;
  return clamp(0.04 + normalized * 0.25, 0.02, 0.4);
}

export function zipProbAtLeastOne(lambda: number, structuralZeroProb = 0.12): number {
  const safeLambda = Math.max(0, lambda);
  const poissonZero = Math.exp(-safeLambda);
  const zipZero = structuralZeroProb + (1 - structuralZeroProb) * poissonZero;
  return clamp(1 - zipZero, 0, 1);
}

export function zipProbZero(lambda: number, structuralZeroProb = 0.12): number {
  const safeLambda = Math.max(0, lambda);
  const poissonZero = Math.exp(-safeLambda);
  return structuralZeroProb + (1 - structuralZeroProb) * poissonZero;
}

function structuralZeroForGoals(player: SquadPlayer): number {
  const role = resolveSquadPlayerLineupRole({
    fieldPosition: player.fieldPosition,
    position: player.position,
  });
  const tokens = parseTacticalPositionTokens(player.fieldPosition ?? player.position);
  const slot = (tokens[0] ?? player.fieldPosition ?? "").toUpperCase();
  if (slot === "ST" || slot === "CF" || slot === "LS" || slot === "RS") return 0.1;
  if (slot === "LW" || slot === "RW" || slot === "LF" || slot === "RF") return 0.15;
  if (role === "F") return 0.12;
  if (role === "M") return 0.18;
  return 0.2;
}

function structuralZeroForAssists(player: SquadPlayer): number {
  const role = resolveSquadPlayerLineupRole({
    fieldPosition: player.fieldPosition,
    position: player.position,
  });
  if (role === "M") return 0.12;
  if (role === "F") return 0.15;
  return 0.2;
}

function resolveExpectedMinutes(player: SquadPlayer): number {
  if (player.startSharePct != null) {
    return clamp(player.startSharePct / 100, 0.35, 1) * 90;
  }
  if (player.performanceScore != null && player.performanceScore >= 70) return 72;
  return 45;
}

function isPoacherProfile(xgPerShot: number): boolean {
  return xgPerShot >= 0.14;
}

function isVolumeShooterProfile(xgPerShot: number): boolean {
  return xgPerShot > 0 && xgPerShot < 0.08;
}

export function computeTacticalMultiplier(
  player: SquadPlayer,
  opponentProfile: ShotProfile | null,
  leagueSsi = 0.1
): number {
  if (!opponentProfile || opponentProfile.sampleWeight <= 0) return 1;

  const stats = detailStatsToRecord(player.detailStats);
  const xg90 =
    per90(stats, ["npxG", "npxg"]) ??
    per90(stats, ["xG", "Expected goals", "xG/90"]) ??
    performanceToNpxGProxy(player.performanceScore);
  const shots90 =
    per90(stats, ["Sh", "Shots", "shots"]) ??
    per90(stats, ["SoT", "Shots on target"]) ??
    0.1;
  const xgPerShot = xg90 / Math.max(shots90, 0.1);

  const safeLeagueSsi = Math.max(leagueSsi, 0.05);
  const oppSsiRel = opponentProfile.ssi / safeLeagueSsi;

  let mult = 1;
  if (isPoacherProfile(xgPerShot) && oppSsiRel > 1.05) {
    mult += (oppSsiRel - 1) * 0.35;
  } else if (isVolumeShooterProfile(xgPerShot) && oppSsiRel < 0.95) {
    mult += (1 - oppSsiRel) * 0.35;
  }

  return clamp(mult, 0.85, 1.2);
}

export function playerNamesMatch(
  playerName: string,
  otherName: string | null | undefined
): boolean {
  if (!otherName) return false;
  const playerKeys = new Set(playerNameLookupKeys(playerName).map(normalizeText));
  const otherKeys = playerNameLookupKeys(otherName).map(normalizeText);
  return otherKeys.some((key) => playerKeys.has(key));
}

function resolveGoalRate90(
  stats: Record<string, string | number | null>,
  player: SquadPlayer
): number {
  return (
    per90(stats, ["npxG", "npxg"]) ??
    per90(stats, ["xG", "Expected goals", "xG/90"]) ??
    per90(stats, ["Gls", "Goals", "goals"]) ??
    performanceToNpxGProxy(player.performanceScore)
  );
}

function resolveAssistRate90(
  stats: Record<string, string | number | null>,
  player: SquadPlayer
): number {
  return (
    per90(stats, ["xA", "xAG", "Expected assists", "xA/90"]) ??
    per90(stats, ["Ast", "Assists", "assists"]) ??
    performanceToXAProxy(player.performanceScore)
  );
}

function buildLikelyXi(squad: TeamSquadSnapshot): SquadPlayer[] {
  const roster = [...squad.starters, ...squad.substitutes];
  if (!roster.length) return [];

  const byId = new Map<number, SquadPlayer>();
  for (const player of roster) {
    const existing = byId.get(player.sofascorePlayerId);
    if (!existing || (player.startSharePct ?? 0) > (existing.startSharePct ?? 0)) {
      byId.set(player.sofascorePlayerId, player);
    }
  }

  return [...byId.values()]
    .filter(
      (player) =>
        resolveSquadPlayerLineupRole({
          fieldPosition: player.fieldPosition,
          position: player.position,
        }) !== "G"
    )
    .sort((a, b) => (b.startSharePct ?? 0) - (a.startSharePct ?? 0));
}

function buildCandidatesForTeam(input: {
  squad: TeamSquadSnapshot;
  teamExpectedGoals: number;
  opponentProfile: ShotProfile | null;
  leagueSsi: number;
  penaltyTakerName: string | null;
}): PlayerPropCandidate[] {
  const xi = buildLikelyXi(input.squad);
  if (!xi.length) return [];

  const rawEntries = xi.map((player) => {
    const stats = detailStatsToRecord(player.detailStats);
    const expectedMinutes = resolveExpectedMinutes(player);
    const minutesFactor = expectedMinutes / 90;
    const baseGoalLambda = resolveGoalRate90(stats, player) * minutesFactor;
    const baseAssistLambda = resolveAssistRate90(stats, player) * minutesFactor;
    const tacticalMultiplier = computeTacticalMultiplier(
      player,
      input.opponentProfile,
      input.leagueSsi
    );
    const isPenaltyTaker = playerNamesMatch(player.name, input.penaltyTakerName);

    return {
      player,
      baseGoalLambda,
      baseAssistLambda,
      tacticalMultiplier,
      isPenaltyTaker,
    };
  });

  const sumBaseGoals = rawEntries.reduce(
    (sum, e) => sum + e.baseGoalLambda * e.tacticalMultiplier,
    0
  );
  const sumBaseAssists = rawEntries.reduce(
    (sum, e) => sum + e.baseAssistLambda * e.tacticalMultiplier,
    0
  );

  const teamGoalBudget = input.teamExpectedGoals * TEAM_GOAL_SHARE;
  const teamAssistBudget = input.teamExpectedGoals * TEAM_ASSIST_BUDGET_RATIO;

  return rawEntries.map((entry) => {
    let normalizedGoalLambda =
      entry.baseGoalLambda *
      entry.tacticalMultiplier *
      (teamGoalBudget / Math.max(sumBaseGoals, MIN_SUM_BASE));
    let normalizedAssistLambda =
      entry.baseAssistLambda *
      entry.tacticalMultiplier *
      (teamAssistBudget / Math.max(sumBaseAssists, MIN_SUM_BASE));

    if (entry.isPenaltyTaker) {
      normalizedGoalLambda += PENALTY_TAKER_GOAL_BUMP;
    }

    const piGoal = structuralZeroForGoals(entry.player);
    const piAssist = structuralZeroForAssists(entry.player);
    const anytimeProb = zipProbAtLeastOne(normalizedGoalLambda, piGoal);
    const goalOrAssistProb =
      1 -
      zipProbZero(normalizedGoalLambda, piGoal) * zipProbZero(normalizedAssistLambda, piAssist);

    return {
      ...entry,
      normalizedGoalLambda,
      normalizedAssistLambda,
      anytimeProb,
      goalOrAssistProb,
    };
  });
}

function toPropLine(
  candidate: PlayerPropCandidate,
  rank: number,
  market: PlayerPropMarket
): PlayerPropLine {
  const prob = market === "anytime_scorer" ? candidate.anytimeProb : candidate.goalOrAssistProb;
  const probabilityPct = Math.round(prob * 1000) / 10;
  const fairDecimalOdds =
    prob > 0 ? Math.round((1 / prob) * 100) / 100 : 999;

  return {
    rank,
    playerName: candidate.player.name,
    position: candidate.player.position,
    fieldPosition: candidate.player.fieldPosition,
    expectedGoals: Math.round(candidate.normalizedGoalLambda * 1000) / 1000,
    expectedAssists: Math.round(candidate.normalizedAssistLambda * 1000) / 1000,
    probabilityPct,
    fairDecimalOdds,
    isPenaltyTaker: candidate.isPenaltyTaker,
    tacticalMultiplier: Math.round(candidate.tacticalMultiplier * 1000) / 1000,
  };
}

function rankTopN(
  candidates: PlayerPropCandidate[],
  market: PlayerPropMarket,
  n = TOP_N
): PlayerPropLine[] {
  const sorted = [...candidates].sort((a, b) => {
    const probA = market === "anytime_scorer" ? a.anytimeProb : a.goalOrAssistProb;
    const probB = market === "anytime_scorer" ? b.anytimeProb : b.goalOrAssistProb;
    return probB - probA;
  });

  return sorted.slice(0, n).map((candidate, index) => toPropLine(candidate, index + 1, market));
}

export function computeTeamPlayerProps(input: {
  teamName: string;
  teamId: number;
  teamExpectedGoals: number;
  squad: TeamSquadSnapshot;
  opponentProfile: ShotProfile | null;
  leagueSsi?: number;
  penaltyTakerName?: string | null;
}): TeamPlayerPropsSide {
  const candidates = buildCandidatesForTeam({
    squad: input.squad,
    teamExpectedGoals: input.teamExpectedGoals,
    opponentProfile: input.opponentProfile,
    leagueSsi: input.leagueSsi ?? 0.1,
    penaltyTakerName: input.penaltyTakerName ?? null,
  });

  return {
    teamName: input.teamName,
    teamId: input.teamId,
    teamExpectedGoals: input.teamExpectedGoals,
    anytimeScorer: rankTopN(candidates, "anytime_scorer"),
    goalOrAssist: rankTopN(candidates, "goal_or_assist"),
  };
}

export function computePlayerPropsPayload(input: {
  modelVersion: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: number;
  awayTeamId: number;
  homeXg: number;
  awayXg: number;
  homeSquad: TeamSquadSnapshot;
  awaySquad: TeamSquadSnapshot;
  homeOpponentProfile?: ShotProfile | null;
  awayOpponentProfile?: ShotProfile | null;
  homePenaltyTaker?: string | null;
  awayPenaltyTaker?: string | null;
}): PlayerPropsPayload {
  const warnings: string[] = [];
  const homeHasData =
    input.homeSquad.starters.length > 0 || input.homeSquad.substitutes.length > 0;
  const awayHasData =
    input.awaySquad.starters.length > 0 || input.awaySquad.substitutes.length > 0;

  if (!homeHasData) warnings.push(`${input.homeTeamName}: squad data unavailable.`);
  if (!awayHasData) warnings.push(`${input.awayTeamName}: squad data unavailable.`);

  const homeLeagueSsi =
    input.homeOpponentProfile && input.awayOpponentProfile
      ? (input.homeOpponentProfile.ssi + input.awayOpponentProfile.ssi) / 2
      : 0.1;
  const awayLeagueSsi = homeLeagueSsi;

  const home = computeTeamPlayerProps({
    teamName: input.homeTeamName,
    teamId: input.homeTeamId,
    teamExpectedGoals: input.homeXg,
    squad: input.homeSquad,
    opponentProfile: input.awayOpponentProfile ?? null,
    leagueSsi: homeLeagueSsi,
    penaltyTakerName: input.homePenaltyTaker ?? null,
  });

  const away = computeTeamPlayerProps({
    teamName: input.awayTeamName,
    teamId: input.awayTeamId,
    teamExpectedGoals: input.awayXg,
    squad: input.awaySquad,
    opponentProfile: input.homeOpponentProfile ?? null,
    leagueSsi: awayLeagueSsi,
    penaltyTakerName: input.awayPenaltyTaker ?? null,
  });

  if (home.anytimeScorer.length === 0 && homeHasData) {
    warnings.push(`${input.homeTeamName}: no attacking players with xG data in squad.`);
  }
  if (away.anytimeScorer.length === 0 && awayHasData) {
    warnings.push(`${input.awayTeamName}: no attacking players with xG data in squad.`);
  }

  return {
    computedAt: new Date().toISOString(),
    modelVersion: input.modelVersion,
    home,
    away,
    warnings,
  };
}

export function sumNormalizedGoalLambdas(
  squad: TeamSquadSnapshot,
  teamExpectedGoals: number,
  opponentProfile: ShotProfile | null = null
): number {
  const candidates = buildCandidatesForTeam({
    squad,
    teamExpectedGoals,
    opponentProfile,
    leagueSsi: 0.1,
    penaltyTakerName: null,
  });
  return candidates.reduce((sum, c) => sum + c.normalizedGoalLambda, 0);
}
