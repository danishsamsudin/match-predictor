/**
 * SportMonks statistic type_id → GLPM column mapping.
 * Source: https://docs.sportmonks.com/v3 (core/types + expected types)
 *
 * Note: Expected Goals type_ids (5304/5305/…) are often empty on plans without
 * the Expected add-on even when `statistics` is included. Use
 * {@link estimateShotBasedXgProxy} as a fallback for training features.
 */

export const SM_STAT_TYPE = {
  BALL_POSSESSION: 45,
  SHOTS_TOTAL: 42,
  SHOTS_ON_TARGET: 86,
  CORNERS: 34,
  PASSES: 80,
  ACCURATE_PASSES: 81,
  TACKLES: 78,
  BIG_CHANCES: 580,
  BIG_CHANCES_MISSED: 581,
  EXPECTED_GOALS: 5304,
  EXPECTED_GOALS_ON_TARGET: 5305,
  EXPECTED_GOALS_PREVENTED: 9686,
  NPXG: 7943,
  EXPECTED_GOALS_AGAINST: 9687,
  INTERCEPTIONS: 100,
  CLEARANCES: 101,
  BLOCKS: 102,
  CROSSES: 98,
  /** Saves (team aggregate or GK lineup detail) */
  SAVES: 57,
  ATTACKS: 43,
  DANGEROUS_ATTACKS: 44,
  SHOTS_INSIDE_BOX: 49,
  KEY_PASSES: 117,
  DUELS_WON: 106,
  SUCCESSFUL_DRIBBLES: 109,
  SUCCESSFUL_LONG_PASSES: 27264,
} as const;

/** Map SM type_id to glpm_match_team_stats column (for-side metrics). */
export const SM_TYPE_TO_GLPM_COLUMN: Record<number, string> = {
  [SM_STAT_TYPE.BALL_POSSESSION]: "possession_pct",
  [SM_STAT_TYPE.SHOTS_TOTAL]: "shots",
  [SM_STAT_TYPE.SHOTS_ON_TARGET]: "shots_on_target",
  [SM_STAT_TYPE.PASSES]: "passes",
  [SM_STAT_TYPE.ACCURATE_PASSES]: "successful_passes",
  [SM_STAT_TYPE.TACKLES]: "tackles",
  [SM_STAT_TYPE.BIG_CHANCES]: "big_chances",
  [SM_STAT_TYPE.EXPECTED_GOALS]: "xg",
  [SM_STAT_TYPE.EXPECTED_GOALS_ON_TARGET]: "psxg_faced", // xGoT — mapped carefully per side in mapper
  [SM_STAT_TYPE.EXPECTED_GOALS_PREVENTED]: "goals_prevented",
  [SM_STAT_TYPE.NPXG]: "npxg",
  [SM_STAT_TYPE.EXPECTED_GOALS_AGAINST]: "xg_conceded",
  [SM_STAT_TYPE.INTERCEPTIONS]: "interceptions",
  [SM_STAT_TYPE.CLEARANCES]: "clearances",
  [SM_STAT_TYPE.BLOCKS]: "blocks",
  [SM_STAT_TYPE.CROSSES]: "crosses",
};

/**
 * Shot-volume xG proxy when provider Expected Goals is unavailable.
 * Tuned to typical PL-scale conversion (~0.1 xG/shot, higher weight on SoT / big chances).
 */
export function estimateShotBasedXgProxy(args: {
  shots: number | null;
  shotsOnTarget: number | null;
  bigChances: number | null;
}): number | null {
  const shots = args.shots;
  const sot = args.shotsOnTarget;
  const bc = args.bigChances;
  if (shots == null && sot == null && bc == null) return null;
  const s = Math.max(0, shots ?? 0);
  const so = Math.max(0, sot ?? 0);
  const b = Math.max(0, bc ?? 0);
  if (s === 0 && so === 0 && b === 0) return 0;
  const raw = 0.06 * s + 0.22 * so + 0.28 * b;
  return Math.round(Math.max(0.05, Math.min(6, raw)) * 1000) / 1000;
}

export function parseStatValue(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace("%", "").trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    return parseStatValue((raw as { value: unknown }).value);
  }
  return null;
}
