import type { FixtureLineup, LineupPlayer, TopScorer } from "@/lib/types/football";
import type { LineupImpactResult } from "@/lib/types/prediction";

const STARTER_FORM_THRESHOLD = 6.5;
const BENCH_FORM_THRESHOLD = 6.3;
export const LAV_BASELINE_SCORE = 65;
const LAV_ATTACK_MIN = 0.75;
const LAV_ATTACK_MAX = 1.15;
const LAV_DEFENSE_MIN = 0.85;
const LAV_DEFENSE_MAX = 1.2;

const ATTACK_POSITIONS = new Set(["F", "M"]);
const DEFENSE_POSITIONS = new Set(["D", "G"]);

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

export function computeLineupImpact(
  lineups: FixtureLineup[],
  topScorers: TopScorer[],
  homeTeamId: number,
  awayTeamId: number
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
  };
}
