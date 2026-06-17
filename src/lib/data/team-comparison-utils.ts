/** Shared constants/helpers for team comparison UI (safe for client import). */

export const BETTING_INSIGHTS_WINDOW = 10;

export function displayValue(value: string | null | undefined): string {
  if (value == null || value === "") return "N/A";
  const t = value.trim();
  if (t === "0" || t === "0.0" || t === "0.00") return "N/A";
  return value;
}

/** Format FIFA ranking points with 2 decimal places (official FIFA precision). */
export function formatFifaRankingPoints(points: number): string {
  return (Math.round(points * 100) / 100).toFixed(2);
}
