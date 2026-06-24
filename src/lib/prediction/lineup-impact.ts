import type { FixtureLineup, LineupPlayer, TopScorer } from "@/lib/types/football";
import type { LineupImpactResult } from "@/lib/types/prediction";
import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";
import { countTeamCardsInTournament } from "@/lib/data/lineup-suspensions";

const STARTER_FORM_THRESHOLD = 6.5;
const BENCH_FORM_THRESHOLD = 6.3;
export const LAV_BASELINE_SCORE = 65;
const LAV_ATTACK_MIN = 0.75;
const LAV_ATTACK_MAX = 1.15;
const LAV_DEFENSE_MIN = 0.85;
const LAV_DEFENSE_MAX = 1.2;

const ATTACK_POSITIONS = new Set(["F", "M"]);
const DEFENSE_POSITIONS = new Set(["D", "G"]);

/** ~3 yellows + 0.3 reds per match international prior for discipline risk normalization. */
const DISCIPLINE_RISK_PRIOR_PER_MATCH = 3.9;

export const EMPTY_LINEUP_SUSPENSION_METRICS = {
  homeSuspensionLavImpact: 0,
  awaySuspensionLavImpact: 0,
  homeDisciplineRiskIndex: 0,
  awayDisciplineRiskIndex: 0,
} as const;

/** Neutral default — unrated players must not drag LAV toward zero. */
export function resolvePlayerPerformanceScore(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return LAV_BASELINE_SCORE;
  return raw;
}

/** Map SofaScore-style average rating (~5–8) to 0–100 performance scale. */
export function ratingToPerformanceScore(avgRating: number): number {
  const scaled = (avgRating - 5) * 25 + 50;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function positionGroup(pos: string): "attack" | "defense" | null {
  if (ATTACK_POSITIONS.has(pos)) return "attack";
  if (DEFENSE_POSITIONS.has(pos)) return "defense";
  return null;
}

function getStarterIds(lineup: FixtureLineup | undefined): Set<number> {
  if (!lineup) return new Set();
  return new Set(lineup.startXI.map((p) => p.player.id));
}

function hasGoalkeeper(lineup: FixtureLineup | undefined): boolean {
  if (!lineup) return true;
  return lineup.startXI.some((p) => p.player.pos === "G");
}

function getTopScorersForTeam(
  topScorers: TopScorer[],
  teamId: number,
  limit = 3
): TopScorer[] {
  return topScorers
    .filter((s) => s.statistics.some((st) => st.team.id === teamId))
    .sort((a, b) => {
      const goalsA = a.statistics[0]?.goals.total ?? 0;
      const goalsB = b.statistics[0]?.goals.total ?? 0;
      return goalsB - goalsA;
    })
    .slice(0, limit);
}

function playerScore(slot: LineupPlayer): number {
  const raw =
    slot.player.performanceScore ??
    (slot.player.averageRating != null
      ? ratingToPerformanceScore(slot.player.averageRating)
      : null);
  return resolvePlayerPerformanceScore(raw);
}

function averagePositionLav(
  starters: LineupPlayer[],
  positions: Set<string>
): number | null {
  const filtered = starters.filter((p) => positions.has(p.player.pos));
  if (!filtered.length) return null;
  const sum = filtered.reduce((acc, p) => acc + playerScore(p), 0);
  return sum / filtered.length;
}

function computeLavMultipliers(lineup: FixtureLineup | undefined): {
  attackMult: number;
  defenseMult: number;
} {
  if (!lineup?.startXI.length) {
    return { attackMult: 1, defenseMult: 1 };
  }

  const attackLav = averagePositionLav(lineup.startXI, ATTACK_POSITIONS);
  const defenseLav = averagePositionLav(lineup.startXI, DEFENSE_POSITIONS);

  const attackMult =
    attackLav != null
      ? clamp(attackLav / LAV_BASELINE_SCORE, LAV_ATTACK_MIN, LAV_ATTACK_MAX)
      : 1;

  const defenseMult =
    defenseLav != null
      ? clamp(LAV_BASELINE_SCORE / defenseLav, LAV_DEFENSE_MIN, LAV_DEFENSE_MAX)
      : 1;

  return { attackMult, defenseMult };
}

function replacementAverageForGroup(
  lineup: FixtureLineup | undefined,
  group: "attack" | "defense",
  suspendedPlayerIds: Set<number>
): number {
  if (!lineup?.substitutes?.length) return LAV_BASELINE_SCORE;
  const positions = group === "attack" ? ATTACK_POSITIONS : DEFENSE_POSITIONS;
  const pool = lineup.substitutes.filter(
    (p) => positions.has(p.player.pos) && !suspendedPlayerIds.has(p.player.id)
  );
  if (!pool.length) return LAV_BASELINE_SCORE;
  return pool.reduce((sum, p) => sum + playerScore(p), 0) / pool.length;
}

export function computeSuspensionLavDelta(
  lineup: FixtureLineup | undefined,
  suspendedPlayerIds: Set<number>
): {
  totalImpact: number;
  attackDelta: number;
  defenseDelta: number;
  notes: string[];
} {
  if (!lineup || suspendedPlayerIds.size === 0) {
    return { totalImpact: 0, attackDelta: 0, defenseDelta: 0, notes: [] };
  }

  const squad = [...lineup.startXI, ...(lineup.substitutes ?? [])];
  let totalImpact = 0;
  let attackDelta = 0;
  let defenseDelta = 0;
  const notes: string[] = [];
  let suspendedCount = 0;

  for (const slot of squad) {
    if (!suspendedPlayerIds.has(slot.player.id)) continue;
    const group = positionGroup(slot.player.pos);
    if (!group) continue;

    const suspendedScore = playerScore(slot);
    const replacementAvg = replacementAverageForGroup(lineup, group, suspendedPlayerIds);
    const lavDelta = Math.max(0, suspendedScore - replacementAvg);
    totalImpact += lavDelta;
    suspendedCount += 1;
    if (group === "attack") attackDelta += lavDelta;
    else defenseDelta += lavDelta;
  }

  if (suspendedCount > 0) {
    notes.push(
      `Suspension LAV impact +${totalImpact.toFixed(1)} (${suspendedCount} player${suspendedCount === 1 ? "" : "s"}).`
    );
  }

  return { totalImpact, attackDelta, defenseDelta, notes };
}

export function computeDisciplineRiskIndex(
  teamId: number,
  teamName: string | undefined,
  allTournamentEvents: SportApiEvent[],
  incidentsByEventId: ReadonlyMap<number, SportApiIncidentsResponse>
): number {
  const { yellows, reds, matchesPlayed } = countTeamCardsInTournament({
    teamId,
    teamName,
    allTournamentEvents,
    incidentsByEventId,
  });
  const rawPerMatch = (yellows + reds * 3) / Math.max(1, matchesPlayed);
  return clamp(rawPerMatch / DISCIPLINE_RISK_PRIOR_PER_MATCH, 0, 1);
}

export function applySquadFormDecay(
  lineup: FixtureLineup | undefined,
  multiplier: number
): { multiplier: number; note?: string } {
  if (!lineup) return { multiplier };

  const outOfFormStarters = lineup.startXI.filter(
    (p) => p.player.averageRating != null && p.player.averageRating < STARTER_FORM_THRESHOLD
  ).length;

  const outOfFormSubs =
    lineup.substitutes?.filter(
      (p) => p.player.averageRating != null && p.player.averageRating < BENCH_FORM_THRESHOLD
    ).length ?? 0;

  let squadDeficit = 0;
  if (outOfFormStarters > 3) squadDeficit += outOfFormStarters * 0.03;
  if (outOfFormSubs > 3) squadDeficit += outOfFormSubs * 0.015;

  if (squadDeficit === 0) return { multiplier };

  const next = multiplier * Math.max(0.75, 1.0 - squadDeficit);
  const parts: string[] = [];
  if (outOfFormStarters > 3) {
    parts.push(`${outOfFormStarters} starters below ${STARTER_FORM_THRESHOLD}`);
  }
  if (outOfFormSubs > 3) {
    parts.push(`${outOfFormSubs} bench players below ${BENCH_FORM_THRESHOLD}`);
  }
  return {
    multiplier: next,
    note: `Squad form decay (${parts.join("; ")}) - attacking xG ×${next.toFixed(2)}.`,
  };
}

export type ComputeLineupImpactOptions = {
  homeSuspendedPlayerIds?: Set<number>;
  awaySuspendedPlayerIds?: Set<number>;
  allTournamentEvents?: SportApiEvent[];
  incidentsByEventId?: ReadonlyMap<number, SportApiIncidentsResponse>;
};

export function computeLineupImpact(
  lineups: FixtureLineup[],
  topScorers: TopScorer[],
  homeTeamId: number,
  awayTeamId: number,
  options?: ComputeLineupImpactOptions
): LineupImpactResult {
  const homeLineup = lineups.find((l) => l.team.id === homeTeamId);
  const awayLineup = lineups.find((l) => l.team.id === awayTeamId);
  const homeStarters = getStarterIds(homeLineup);
  const awayStarters = getStarterIds(awayLineup);

  const homeLav = computeLavMultipliers(homeLineup);
  const awayLav = computeLavMultipliers(awayLineup);

  let homeXgMultiplier = homeLav.attackMult;
  let awayXgMultiplier = awayLav.attackMult;
  let homeDefenseMultiplier = homeLav.defenseMult;
  let awayDefenseMultiplier = awayLav.defenseMult;
  const notes: string[] = [];

  const homeSuspended = options?.homeSuspendedPlayerIds ?? new Set<number>();
  const awaySuspended = options?.awaySuspendedPlayerIds ?? new Set<number>();

  const homeSuspension = computeSuspensionLavDelta(homeLineup, homeSuspended);
  const awaySuspension = computeSuspensionLavDelta(awayLineup, awaySuspended);
  notes.push(...homeSuspension.notes, ...awaySuspension.notes);

  let homeDisciplineRiskIndex = 0;
  let awayDisciplineRiskIndex = 0;
  if (options?.allTournamentEvents?.length && options.incidentsByEventId) {
    homeDisciplineRiskIndex = computeDisciplineRiskIndex(
      homeTeamId,
      homeLineup?.team.name,
      options.allTournamentEvents,
      options.incidentsByEventId
    );
    awayDisciplineRiskIndex = computeDisciplineRiskIndex(
      awayTeamId,
      awayLineup?.team.name,
      options.allTournamentEvents,
      options.incidentsByEventId
    );
  }

  if (homeLav.attackMult !== 1 || homeLav.defenseMult !== 1) {
    notes.push(
      `Home LAV — attack ×${homeLav.attackMult.toFixed(2)}, defense exposure ×${homeLav.defenseMult.toFixed(2)}.`
    );
  }
  if (awayLav.attackMult !== 1 || awayLav.defenseMult !== 1) {
    notes.push(
      `Away LAV — attack ×${awayLav.attackMult.toFixed(2)}, defense exposure ×${awayLav.defenseMult.toFixed(2)}.`
    );
  }

  const homeTopScorers = getTopScorersForTeam(topScorers, homeTeamId);
  const awayTopScorers = getTopScorersForTeam(topScorers, awayTeamId);

  if (homeTopScorers.length > 0 && !homeStarters.has(homeTopScorers[0].player.id)) {
    homeXgMultiplier *= 0.8;
    notes.push(
      `Home team missing top scorer ${homeTopScorers[0].player.name} (-20% xG cap).`
    );
  }

  if (awayTopScorers.length > 0 && !awayStarters.has(awayTopScorers[0].player.id)) {
    awayXgMultiplier *= 0.8;
    notes.push(
      `Away team missing top scorer ${awayTopScorers[0].player.name} (-20% xG cap).`
    );
  }

  if (!hasGoalkeeper(homeLineup)) {
    awayDefenseMultiplier = Math.max(awayDefenseMultiplier, 1.15);
    notes.push("Home team missing starting goalkeeper (+15% away xG cap).");
  }

  if (!hasGoalkeeper(awayLineup)) {
    homeDefenseMultiplier = Math.max(homeDefenseMultiplier, 1.15);
    notes.push("Away team missing starting goalkeeper (+15% home xG cap).");
  }

  const homeDecay = applySquadFormDecay(homeLineup, homeXgMultiplier);
  homeXgMultiplier = homeDecay.multiplier;
  if (homeDecay.note) notes.push(homeDecay.note);

  const awayDecay = applySquadFormDecay(awayLineup, awayXgMultiplier);
  awayXgMultiplier = awayDecay.multiplier;
  if (awayDecay.note) notes.push(awayDecay.note);

  if (notes.length === 0) {
    notes.push("Full strength lineups expected - no major absences detected.");
  }

  return {
    homeXgMultiplier,
    awayXgMultiplier,
    homeDefenseMultiplier,
    awayDefenseMultiplier,
    notes,
    homeSuspensionLavImpact: homeSuspension.totalImpact,
    awaySuspensionLavImpact: awaySuspension.totalImpact,
    homeDisciplineRiskIndex,
    awayDisciplineRiskIndex,
    homeAttackLavDelta: homeSuspension.attackDelta,
    homeDefenseLavDelta: homeSuspension.defenseDelta,
    awayAttackLavDelta: awaySuspension.attackDelta,
    awayDefenseLavDelta: awaySuspension.defenseDelta,
  };
}
