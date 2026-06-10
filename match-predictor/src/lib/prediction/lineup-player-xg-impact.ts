import { findStatInRecord } from "@/lib/data/player-stat-display";
import {
  computeReliabilityFactor,
  statsLookPer90,
} from "@/lib/data/compute-player-performance-score";
import { LAV_BASELINE_SCORE } from "@/lib/prediction/lineup-impact";
import type {
  LineupPlayerStatsMap,
  ResolvedLineupPlayer,
} from "@/lib/prediction/resolve-lineup-player-stats";
import type { LineupImpactResult } from "@/lib/types/prediction";

const ATTACK_MIN = 0.75;
const ATTACK_MAX = 1.15;
const DEFENSE_MIN = 0.85;
const DEFENSE_MAX = 1.2;
const MIN_COVERAGE_FOR_BLEND = 8;
const BLEND_WEIGHT_FULL = 0.4;
const BLEND_WEIGHT_LOW = 0.2;

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

function getMinutes(stats: Record<string, string | number | null>): number | null {
  return parseNum(findStatInRecord(stats, ["Min", "Minutes", "minutes", "Mins", "gk_minutes"]));
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

function hasStatCoverage(player: ResolvedLineupPlayer): boolean {
  const { stats, role } = player;
  if (role === "F") {
    return (
      per90(stats, ["npxG", "xG", "Expected goals", "xG/90"]) != null ||
      per90(stats, ["Gls", "Goals", "goals"]) != null
    );
  }
  if (role === "M") {
    return (
      per90(stats, ["xA", "xAG", "Expected assists"]) != null ||
      per90(stats, ["KP", "Key passes", "SCA"]) != null
    );
  }
  if (role === "D") {
    return (
      per90(stats, ["Int", "Interceptions"]) != null ||
      parseNum(findStatInRecord(stats, ["CS", "Clean sheets"])) != null
    );
  }
  if (role === "G") {
    return (
      parseNum(findStatInRecord(stats, ["gk_save_pct", "Save%", "save_pct"])) != null ||
      parseNum(findStatInRecord(stats, ["gk_goals_against", "GA"])) != null
    );
  }
  return false;
}

function performanceToNpxGProxy(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0.08;
  const normalized = (score - LAV_BASELINE_SCORE) / 100;
  return clamp(0.08 + normalized * 0.35, 0.02, 0.55);
}

function attackContribution(player: ResolvedLineupPlayer): number {
  const { stats, role, performanceScore } = player;
  const minutes = getMinutes(stats) ?? 0;
  const reliability = computeReliabilityFactor(Math.max(minutes, 90));
  const scale = 0.85 * reliability;

  if (role === "F") {
    const npxg =
      per90(stats, ["npxG", "npxg"]) ??
      per90(stats, ["xG", "Expected goals", "xG/90"]) ??
      per90(stats, ["Gls", "Goals", "goals"]) ??
      performanceToNpxGProxy(performanceScore);
    return npxg * scale;
  }

  if (role === "M") {
    const xa = per90(stats, ["xA", "xAG", "Expected assists", "xA/90"]) ?? 0;
    const npxg =
      per90(stats, ["npxG", "npxG"]) ??
      per90(stats, ["xG", "Expected goals"]) ??
      0;
    const sca = per90(stats, ["SCA", "KP", "Key passes", "key passes"]) ?? 0;
    const composite = 0.55 * xa + 0.25 * npxg + 0.2 * sca * 0.15;
    if (composite <= 0) return performanceToNpxGProxy(performanceScore) * 0.5 * scale;
    return composite * scale;
  }

  if (role === "D") {
    const npxg = per90(stats, ["npxG", "xG", "Expected goals"]) ?? 0;
    return npxg * 0.15 * scale;
  }

  return 0;
}

function defenseQuality(player: ResolvedLineupPlayer): number {
  const { stats, role, performanceScore } = player;
  const perfNorm =
    performanceScore != null ? performanceScore / 100 : LAV_BASELINE_SCORE / 100;

  if (role === "G") {
    const savePct = parseNum(
      findStatInRecord(stats, ["gk_save_pct", "Save%", "save_pct", "save pct"])
    );
    let saveScore = perfNorm;
    if (savePct != null) {
      const pct = savePct <= 1 ? savePct * 100 : savePct;
      saveScore = clamp(pct / 100, 0.3, 1);
    }
    const ga = parseNum(findStatInRecord(stats, ["gk_goals_against", "GA", "goals_against"]));
    const gaPenalty = ga != null ? clamp(1 - ga / 60, 0.4, 1) : 1;
    return saveScore * gaPenalty;
  }

  if (role === "D") {
    const int = per90(stats, ["Int", "Interceptions", "interceptions"]) ?? 0;
    const tkl = per90(stats, ["Tkl", "TklW", "Tackles", "tackles_won"]) ?? 0;
    const apps = parseNum(findStatInRecord(stats, ["MP", "Apps", "Appearances"])) ?? 0;
    const cs = parseNum(findStatInRecord(stats, ["CS", "Clean sheets"]));
    let csRatio = perfNorm * 0.5;
    if (cs != null && apps > 0) {
      csRatio = cs <= 1 ? cs : cs / apps;
    }
    const defRate = clamp((int + tkl) / 6, 0, 1);
    return clamp(csRatio * 0.5 + defRate * 0.3 + perfNorm * 0.2, 0.2, 1);
  }

  return perfNorm * 0.6;
}

function teamAttackXgFromLineup(players: LineupPlayerStatsMap, mu: number): {
  lineupXg: number;
  coverage: number;
} {
  let sum = 0;
  let coverage = 0;
  for (const player of players.values()) {
    sum += attackContribution(player);
    if (hasStatCoverage(player)) coverage += 1;
  }
  const lineupXg = sum > 0 ? sum : mu * 0.85;
  return { lineupXg, coverage };
}

function teamDefenseMultFromLineup(
  players: LineupPlayerStatsMap,
  baselineQuality: number
): number {
  const defPlayers = [...players.values()].filter((p) => p.role === "G" || p.role === "D");
  if (!defPlayers.length) return 1;
  const avgQuality =
    defPlayers.reduce((acc, p) => acc + defenseQuality(p), 0) / defPlayers.length;
  if (baselineQuality <= 0) return 1;
  return clamp(baselineQuality / avgQuality, DEFENSE_MIN, DEFENSE_MAX);
}

function computeSideImpact(input: {
  players: LineupPlayerStatsMap;
  baseXg: number;
  mu: number;
  baselineDefenseQuality: number;
}): {
  attackMult: number;
  defenseMult: number;
  coverage: number;
  notes: string[];
} {
  const { lineupXg, coverage } = teamAttackXgFromLineup(input.players, input.mu);
  const blendWeight =
    coverage >= MIN_COVERAGE_FOR_BLEND ? BLEND_WEIGHT_FULL : BLEND_WEIGHT_LOW;
  const blendedXg =
    (1 - blendWeight) * input.baseXg + blendWeight * lineupXg;
  const attackMult = clamp(
    input.baseXg > 0 ? blendedXg / input.baseXg : 1,
    ATTACK_MIN,
    ATTACK_MAX
  );
  const defenseMult = teamDefenseMultFromLineup(
    input.players,
    input.baselineDefenseQuality
  );

  return {
    attackMult,
    defenseMult,
    coverage,
    notes: [
      `Player-xG blend (w=${blendWeight.toFixed(2)}, ${coverage}/11 stat coverage): lineup λ=${lineupXg.toFixed(2)} → attack ×${attackMult.toFixed(2)}, defense exposure ×${defenseMult.toFixed(2)}.`,
    ],
  };
}

/** Player-xG lineup impact for manual XI mode. */
export function computeLineupPlayerXgImpact(input: {
  homePlayers: LineupPlayerStatsMap;
  awayPlayers: LineupPlayerStatsMap;
  baseHomeXg: number;
  baseAwayXg: number;
  mu: number;
}): LineupImpactResult {
  const homeBaselineDef = 0.65;
  const awayBaselineDef = 0.65;

  const home = computeSideImpact({
    players: input.homePlayers,
    baseXg: input.baseHomeXg,
    mu: input.mu,
    baselineDefenseQuality: homeBaselineDef,
  });
  const away = computeSideImpact({
    players: input.awayPlayers,
    baseXg: input.baseAwayXg,
    mu: input.mu,
    baselineDefenseQuality: awayBaselineDef,
  });

  return {
    homeXgMultiplier: home.attackMult,
    awayXgMultiplier: away.attackMult,
    homeDefenseMultiplier: home.defenseMult,
    awayDefenseMultiplier: away.defenseMult,
    notes: [
      "Manual XI — player-xG model active.",
      ...home.notes,
      ...away.notes,
    ],
  };
}
