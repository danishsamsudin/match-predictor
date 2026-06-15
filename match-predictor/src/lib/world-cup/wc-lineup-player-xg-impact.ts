import type { LineupImpactResult } from "@/lib/types/prediction";
import type {
  WcLineupPlayerStatsMap,
  WcResolvedLineupPlayer,
} from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

const ATTACK_MIN = 0.78;
const ATTACK_MAX = 1.14;
const DEFENSE_MIN = 0.86;
const DEFENSE_MAX = 1.18;
const MIN_COVERAGE = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function attackContribution(player: WcResolvedLineupPlayer, mu: number): number {
  const avail = clamp(player.availabilityFactor, 0.55, 1);
  const opta = player.avgOptaPoints ?? 6;
  const optaNorm = clamp((opta - 5) / 8, -0.2, 0.45);
  const chance = (player.chanceIndexPer90 ?? 0.15) * 0.85;
  const roleBoost = player.role === "F" ? 1.08 : player.role === "M" ? 1.02 : 0.95;
  return (mu * 0.12 + chance + optaNorm * 0.35) * roleBoost * avail;
}

function defenseContribution(player: WcResolvedLineupPlayer): number {
  const avail = clamp(player.availabilityFactor, 0.55, 1);
  if (player.role === "G") {
    return ((player.gkSaveIndex ?? 0.5) * 0.6 + 0.4) * avail;
  }
  const def = (player.defensiveActionsPer90 ?? 1.5) * 0.22;
  const opta = player.avgOptaPoints ?? 6;
  return (def + clamp((opta - 5) / 20, 0, 0.15)) * avail;
}

function teamAttackFromLineup(players: WcLineupPlayerStatsMap, mu: number): {
  lineupXg: number;
  coverage: number;
} {
  const list = Object.values(players);
  const coverage = list.length;
  if (!coverage) return { lineupXg: mu, coverage: 0 };
  const sum = list.reduce((s, p) => s + attackContribution(p, mu), 0);
  return { lineupXg: sum * 0.95, coverage };
}

function teamDefenseMult(players: WcLineupPlayerStatsMap): number {
  const list = Object.values(players);
  if (!list.length) return 1;
  const avg = list.reduce((s, p) => s + defenseContribution(p), 0) / list.length;
  const baseline = 0.55;
  return clamp(avg / baseline, DEFENSE_MIN, DEFENSE_MAX);
}

function computeSide(input: {
  players: WcLineupPlayerStatsMap;
  baseXg: number;
  mu: number;
  blendWeight: number;
}): { attackMult: number; defenseMult: number; notes: string[] } {
  const { lineupXg, coverage } = teamAttackFromLineup(input.players, input.mu);
  if (coverage === 0) {
    return {
      attackMult: 1,
      defenseMult: 1,
      notes: ["No WC tournament-form coverage — structural xG only."],
    };
  }
  const w =
    coverage >= MIN_COVERAGE ? input.blendWeight : input.blendWeight * 0.5;
  const blended = (1 - w) * input.baseXg + w * lineupXg;
  const attackMult = clamp(
    input.baseXg > 0 ? blended / input.baseXg : 1,
    ATTACK_MIN,
    ATTACK_MAX
  );
  const defenseMult = teamDefenseMult(input.players);
  return {
    attackMult,
    defenseMult,
    notes: [
      `WC lineup blend (w=${w.toFixed(2)}, ${coverage}/11): λ=${lineupXg.toFixed(2)} → attack ×${attackMult.toFixed(2)}, defense ×${defenseMult.toFixed(2)}.`,
    ],
  };
}

export function computeWcLineupPlayerXgImpact(input: {
  homePlayers: WcLineupPlayerStatsMap;
  awayPlayers: WcLineupPlayerStatsMap;
  baseHomeXg: number;
  baseAwayXg: number;
  mu: number;
  calibration?: WcCalibrationConstants;
  mode?: "manual_xi" | "model_xi";
}): LineupImpactResult {
  const attackBlend = input.calibration?.wcLineupAttackBlend ?? 0.35;
  const defenseBlend = input.calibration?.wcLineupDefenseBlend ?? 0.35;
  const label =
    input.mode === "model_xi" ? "Model XI (projected starters)" : "Manual XI (WC tournament form)";

  const home = computeSide({
    players: input.homePlayers,
    baseXg: input.baseHomeXg,
    mu: input.mu,
    blendWeight: attackBlend,
  });
  const away = computeSide({
    players: input.awayPlayers,
    baseXg: input.baseAwayXg,
    mu: input.mu,
    blendWeight: attackBlend,
  });

  const homeDef = 1 + (home.defenseMult - 1) * defenseBlend;
  const awayDef = 1 + (away.defenseMult - 1) * defenseBlend;

  return {
    homeXgMultiplier: home.attackMult,
    awayXgMultiplier: away.attackMult,
    homeDefenseMultiplier: homeDef,
    awayDefenseMultiplier: awayDef,
    notes: [label, ...home.notes, ...away.notes],
  };
}
