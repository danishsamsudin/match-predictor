/**
 * Detect collapsed GLPM primary ratings (everyone on the same 0–100 score).
 *
 * Early-season engine runs with sparse stats can write identical Attack /
 * Defence / … values for every club. Those seasons are not predict-ready.
 */

export const MIN_PRIMARY_RATING_SPREAD = 1;

/** Non-GK dimensions that should separate clubs within a league. */
export const DISCRIMINATING_PRIMARY_COLS = [
  "r_attack",
  "r_defence",
  "r_build_up",
  "r_possession",
  "r_pressing",
  "r_finishing",
] as const;

export type PrimaryVectorRow = Partial<
  Record<(typeof DISCRIMINATING_PRIMARY_COLS)[number], number | null>
>;

export function ratingSpread(values: Array<number | null | undefined>): number {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (nums.length < 2) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

export function columnDiscriminates(
  rows: PrimaryVectorRow[],
  col: (typeof DISCRIMINATING_PRIMARY_COLS)[number],
  minSpread = MIN_PRIMARY_RATING_SPREAD
): boolean {
  return ratingSpread(rows.map((r) => r[col])) >= minSpread;
}

/**
 * True when most non-GK primary dimensions have essentially no team-to-team
 * spread (typical early-season calibrator collapse).
 */
export function seasonVectorsAreCollapsed(
  rows: PrimaryVectorRow[],
  minSpread = MIN_PRIMARY_RATING_SPREAD
): boolean {
  if (rows.length < 2) return true;
  let flat = 0;
  for (const col of DISCRIMINATING_PRIMARY_COLS) {
    if (!columnDiscriminates(rows, col, minSpread)) flat += 1;
  }
  // 4+ of 6 flat ⇒ season is not usable for matchups.
  return flat >= 4;
}
