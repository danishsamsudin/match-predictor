/**
 * Convert our reference season year (e.g. 2025 for 2025/26) into SoccerData season formats.
 * FBref / MatchHistory typically use "2526"; Understat often uses the starting year.
 */
export function resolveSoccerdataSeasonFormats(referenceSeason: number): {
  fbref: string;
  understat: string | number;
  matchHistory: string;
} {
  const startYy = referenceSeason % 100;
  const endYy = (startYy + 1) % 100;
  const twoSeason = `${String(startYy).padStart(2, "0")}${String(endYy).padStart(2, "0")}`;
  return {
    fbref: twoSeason,
    understat: referenceSeason,
    matchHistory: twoSeason,
  };
}

/** Prior two-digit season code (e.g. "2526" → "2425") for MatchHistory fallback. */
export function priorMatchHistorySeasonCode(code: string): string | null {
  if (!/^\d{4}$/.test(code)) return null;
  const startYy = parseInt(code.slice(0, 2), 10);
  if (!Number.isFinite(startYy) || startYy <= 0) return null;
  return `${String(startYy - 1).padStart(2, "0")}${String(startYy).padStart(2, "0")}`;
}

/** Season codes to try for football-data.co.uk CSVs (current, then previous). */
export function matchHistorySeasonCandidates(primary: string): string[] {
  const out: string[] = [primary];
  const prior = priorMatchHistorySeasonCode(primary);
  if (prior && prior !== primary) out.push(prior);
  return out;
}
