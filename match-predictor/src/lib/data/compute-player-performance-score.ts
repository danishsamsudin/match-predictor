import { findStatInRecord } from "@/lib/data/player-stat-display";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratingToScore(rating: number): number {
  if (rating <= 10) return clampScore(rating * 10);
  if (rating <= 100) return clampScore(rating);
  return clampScore(rating);
}

/** Composite 0–100 performance score from Scoutlyst and match ratings. */
export function computePlayerPerformanceScore(input: {
  scoutlystRating: number | null;
  matchAvgRating: number | null;
  stats: Record<string, string | number | null>;
}): number | null {
  if (input.scoutlystRating != null && Number.isFinite(input.scoutlystRating)) {
    return ratingToScore(input.scoutlystRating);
  }

  if (input.matchAvgRating != null && Number.isFinite(input.matchAvgRating)) {
    return ratingToScore(input.matchAvgRating);
  }

  const ppm = findStatInRecord(input.stats, ["PPM", "Rating", "rating", "Score"]);
  if (typeof ppm === "number" && Number.isFinite(ppm)) {
    return ratingToScore(ppm);
  }
  if (typeof ppm === "string") {
    const parsed = Number(ppm.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return ratingToScore(parsed);
  }

  const numericValues: number[] = [];
  for (const value of Object.values(input.stats)) {
    if (typeof value === "number" && Number.isFinite(value)) numericValues.push(value);
  }
  if (!numericValues.length) return null;

  const avg = numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
  if (avg <= 10) return ratingToScore(avg);
  return clampScore(avg);
}
