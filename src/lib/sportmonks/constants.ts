/** SportMonks league IDs for GLPM club competitions. */
export const SM_LEAGUE = {
  PREMIER_LEAGUE: 8,
  EREDIVISIE: 72,
  CHAMPIONSHIP: 9,
  SERIE_A: 384,
  BUNDESLIGA: 82,
} as const;

/** 2025/26 season IDs (SportMonks) — use for training while 2026/27 is unplayed. */
export const SM_SEASON_2025_26 = {
  PREMIER_LEAGUE: 25583,
} as const;

/** 2026/27 season IDs (SportMonks). */
export const SM_SEASON_2026_27 = {
  PREMIER_LEAGUE: 28083,
  EREDIVISIE: 27958,
  CHAMPIONSHIP: 27903,
  SERIE_A: 27895,
  BUNDESLIGA: 28321,
} as const;

export const DEFAULT_GLPM_LEAGUE_IDS: number[] = Object.values(SM_LEAGUE);

export const DEFAULT_GLPM_SEASON_IDS_2026_27: number[] = Object.values(SM_SEASON_2026_27);

export function parseIdList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw?.trim()) return fallback;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return ids.length ? ids : fallback;
}

export function chunkIds(ids: number[], size = 50): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}
