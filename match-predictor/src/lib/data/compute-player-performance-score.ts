import { findStatInRecord } from "@/lib/data/player-stat-display";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";

/** Scoutlyst CSV exports use PPM on a ~0–3 index (not SofaScore 6–10). */
export const SCOUTLYST_PPM_MAX = 3;
export const SCOUTLYST_PPM_MIN = 0;

/** Minimum minutes before composite stats apply (legacy ratings still work below this). */
export const COMPOSITE_MIN_MINUTES = 270;
/** Minimum appearances before composite stats apply. */
export const COMPOSITE_MIN_APPEARANCES = 3;
/** Season ceiling for reliability factor (38 league games × 90 min). */
export const MAX_TEAM_MINUTES = 38 * 90;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** SofaScore-style match ratings (typical range ~5.5–8.5, baseline 6.5). */
export function sofascoreRatingToScore(rating: number): number {
  const SOFA_MIN = 5;
  const SOFA_MAX = 8.5;
  const clamped = Math.max(SOFA_MIN, Math.min(SOFA_MAX, rating));
  const normalized = (clamped - SOFA_MIN) / (SOFA_MAX - SOFA_MIN);
  return clampScore(normalized * 100);
}

/** Scoutlyst performance index (PPM) from exports — scale ~0–3. */
export function scoutlystPpmToScore(ppm: number): number {
  const span = SCOUTLYST_PPM_MAX - SCOUTLYST_PPM_MIN;
  if (span <= 0) return clampScore(ppm);
  const normalized = (ppm - SCOUTLYST_PPM_MIN) / span;
  return clampScore(normalized * 100);
}

/** SoFIFA overall (0–100) maps directly to the display score. */
export function sofifaOverallToScore(overall: number): number {
  return clampScore(overall);
}

function inferRatingScale(value: number): "scoutlyst-ppm" | "sofascore" | "percent" {
  if (value > 10) return "percent";
  if (value <= SCOUTLYST_PPM_MAX + 0.25) return "scoutlyst-ppm";
  return "sofascore";
}

function ratingToScoreByScale(rating: number, scale: "scoutlyst-ppm" | "sofascore" | "percent"): number {
  switch (scale) {
    case "scoutlyst-ppm":
      return scoutlystPpmToScore(rating);
    case "sofascore":
      return sofascoreRatingToScore(rating);
    case "percent":
      return clampScore(rating);
  }
}

function parseNumericStat(
  stats: Record<string, string | number | null>,
  suffixes: string[]
): number | null {
  const raw = findStatInRecord(stats, suffixes);
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMinutesAndApps(stats: Record<string, string | number | null>): {
  minutes: number | null;
  appearances: number | null;
} {
  return {
    minutes: parseNumericStat(stats, ["Min", "Minutes", "minutes", "Mins"]),
    appearances: parseNumericStat(stats, [
      "MP",
      "Apps",
      "Appearances",
      "appearances",
      "games",
      "Games",
    ]),
  };
}

/** True when stat keys or values suggest Scoutlyst /90 export rather than season totals. */
export function statsLookPer90(stats: Record<string, string | number | null>): boolean {
  for (const key of Object.keys(stats)) {
    if (/\/90|per\s*90/i.test(key)) return true;
  }
  const { minutes } = getMinutesAndApps(stats);
  const goals = parseNumericStat(stats, ["Gls", "Goals", "goals", "Goal"]);
  if (minutes != null && minutes > 500 && goals != null && goals < 2) return true;
  return false;
}

/** Normalize a rate to 0–100 using a role-specific cap. */
export function normalizeRateToScore(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return clampScore((value / cap) * 100);
}

export function toPer90(
  value: number,
  minutes: number | null,
  alreadyPer90: boolean
): number | null {
  if (!Number.isFinite(value)) return null;
  if (alreadyPer90) return value;
  if (minutes == null || minutes <= 0) return null;
  return (value / minutes) * 90;
}

export function computeReliabilityFactor(minutes: number): number {
  if (minutes <= 1) return 0;
  const capped = Math.min(minutes, MAX_TEAM_MINUTES);
  return Math.log(capped) / Math.log(MAX_TEAM_MINUTES);
}

function isCompositeEligible(minutes: number | null, appearances: number | null): boolean {
  const minOk = minutes != null && minutes >= COMPOSITE_MIN_MINUTES;
  const appsOk = appearances != null && appearances >= COMPOSITE_MIN_APPEARANCES;
  return minOk || appsOk;
}

function legacyRatingCandidates(input: {
  scoutlystRating: number | null;
  matchAvgRating: number | null;
  stats: Record<string, string | number | null>;
}): number[] {
  const candidates: number[] = [];

  if (input.scoutlystRating != null && Number.isFinite(input.scoutlystRating)) {
    candidates.push(scoutlystPpmToScore(input.scoutlystRating));
  }

  if (input.matchAvgRating != null && Number.isFinite(input.matchAvgRating)) {
    candidates.push(sofascoreRatingToScore(input.matchAvgRating));
  }

  if (!candidates.length) {
    const ppm = findStatInRecord(input.stats, ["PPM", "Rating", "rating", "Score"]);
    if (typeof ppm === "number" && Number.isFinite(ppm)) {
      candidates.push(ratingToScoreByScale(ppm, inferRatingScale(ppm)));
    } else if (typeof ppm === "string") {
      const parsed = Number(ppm.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed)) {
        candidates.push(ratingToScoreByScale(parsed, inferRatingScale(parsed)));
      }
    }
  }

  return candidates;
}

const RATE_CAPS = {
  goals: 1.2,
  xg: 0.8,
  sot: 2.5,
  keyPasses: 3,
  xa: 0.6,
  passCmp: 100,
  tackles: 4,
  interceptions: 3,
  cleanSheetRatio: 0.5,
} as const;

function resolvePpmScore(
  scoutlystRating: number | null,
  stats: Record<string, string | number | null>
): number | null {
  if (scoutlystRating != null && Number.isFinite(scoutlystRating)) {
    return scoutlystPpmToScore(scoutlystRating);
  }
  const ppm = parseNumericStat(stats, ["PPM", "Rating", "rating", "Score"]);
  if (ppm == null) return null;
  return ratingToScoreByScale(ppm, inferRatingScale(ppm));
}

function per90FromStats(
  stats: Record<string, string | number | null>,
  suffixes: string[],
  minutes: number | null,
  alreadyPer90: boolean
): number | null {
  const raw = parseNumericStat(stats, suffixes);
  if (raw == null) return null;
  return toPer90(raw, minutes, alreadyPer90);
}

function computeRoleComposite(
  role: "G" | "D" | "M" | "F",
  stats: Record<string, string | number | null>,
  scoutlystRating: number | null
): number | null {
  const { minutes } = getMinutesAndApps(stats);
  const alreadyPer90 = statsLookPer90(stats);
  const ppmScore = resolvePpmScore(scoutlystRating, stats);

  if (role === "G") {
    return ppmScore;
  }

  if (role === "F") {
    const goals = per90FromStats(stats, ["Gls", "Goals", "goals", "Goal"], minutes, alreadyPer90);
    const xg = per90FromStats(
      stats,
      ["xG", "npxG", "Expected goals", "xG/90"],
      minutes,
      alreadyPer90
    );
    const sot = per90FromStats(
      stats,
      ["SoT", "Shots on target", "on target", "Sh — SoT"],
      minutes,
      alreadyPer90
    );
    if (goals == null && xg == null && sot == null && ppmScore == null) return null;

    const parts: Array<{ w: number; s: number }> = [];
    if (ppmScore != null) parts.push({ w: 0.3, s: ppmScore });
    if (goals != null) parts.push({ w: 0.35, s: normalizeRateToScore(goals, RATE_CAPS.goals) });
    if (xg != null) parts.push({ w: 0.2, s: normalizeRateToScore(xg, RATE_CAPS.xg) });
    if (sot != null) parts.push({ w: 0.15, s: normalizeRateToScore(sot, RATE_CAPS.sot) });

    const totalW = parts.reduce((s, p) => s + p.w, 0);
    if (totalW <= 0) return null;
    return parts.reduce((s, p) => s + (p.w / totalW) * p.s, 0);
  }

  if (role === "M") {
    const kp = per90FromStats(stats, ["KP", "Key passes", "key passes", "SCA"], minutes, alreadyPer90);
    const xa = per90FromStats(
      stats,
      ["xA", "xAG", "Expected assists", "xA/90"],
      minutes,
      alreadyPer90
    );
    const cmp = parseNumericStat(stats, ["Cmp", "Passing — Total — Cmp"]);
    const tackles = per90FromStats(
      stats,
      ["Defense — Tackles — Tkl", "Defense — Tackles — TklW", "Tkl", "TklW", "Tackles", "tackles"],
      minutes,
      alreadyPer90
    );
    if (kp == null && xa == null && cmp == null && tackles == null && ppmScore == null) return null;

    const parts: Array<{ w: number; s: number }> = [];
    if (ppmScore != null) parts.push({ w: 0.3, s: ppmScore });
    if (kp != null) parts.push({ w: 0.25, s: normalizeRateToScore(kp, RATE_CAPS.keyPasses) });
    if (xa != null) parts.push({ w: 0.2, s: normalizeRateToScore(xa, RATE_CAPS.xa) });
    if (cmp != null) {
      const cmpScore =
        cmp <= 1 ? normalizeRateToScore(cmp, 1) : normalizeRateToScore(cmp, RATE_CAPS.passCmp);
      parts.push({ w: 0.15, s: cmpScore });
    }
    if (tackles != null) parts.push({ w: 0.1, s: normalizeRateToScore(tackles, RATE_CAPS.tackles) });

    const totalW = parts.reduce((s, p) => s + p.w, 0);
    if (totalW <= 0) return null;
    return parts.reduce((s, p) => s + (p.w / totalW) * p.s, 0);
  }

  // DEF
  const interceptions = per90FromStats(
    stats,
    ["Defense — Miscellaneous — Int", "Int", "Interceptions", "interceptions"],
    minutes,
    alreadyPer90
  );
  const tackles = per90FromStats(
    stats,
    ["Defense — Tackles — Tkl", "Defense — Tackles — TklW", "Tkl", "TklW", "Tackles", "tackles"],
    minutes,
    alreadyPer90
  );
  const csRaw = parseNumericStat(stats, ["CS", "Clean sheets", "clean sheets"]);
  const { appearances } = getMinutesAndApps(stats);
  let csScore: number | null = null;
  if (csRaw != null && appearances != null && appearances > 0) {
    const ratio = csRaw <= 1 ? csRaw : csRaw / appearances;
    csScore = normalizeRateToScore(ratio, RATE_CAPS.cleanSheetRatio);
  }

  if (interceptions == null && tackles == null && csScore == null && ppmScore == null) return null;

  let wInt = 0.35;
  let wTkl = 0.25;
  let wCs = 0.1;
  if (csScore == null) {
    wInt = 0.4;
    wTkl = 0.3;
    wCs = 0;
  }

  const parts: Array<{ w: number; s: number }> = [];
  if (ppmScore != null) parts.push({ w: 0.3, s: ppmScore });
  if (interceptions != null) parts.push({ w: wInt, s: normalizeRateToScore(interceptions, RATE_CAPS.interceptions) });
  if (tackles != null) parts.push({ w: wTkl, s: normalizeRateToScore(tackles, RATE_CAPS.tackles) });
  if (csScore != null) parts.push({ w: wCs, s: csScore });

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  if (totalW <= 0) return null;
  return parts.reduce((s, p) => s + (p.w / totalW) * p.s, 0);
}

function computeCompositeScore(input: {
  scoutlystRating: number | null;
  stats: Record<string, string | number | null>;
  position: string | null;
}): number | null {
  const { minutes, appearances } = getMinutesAndApps(input.stats);
  if (!isCompositeEligible(minutes, appearances)) return null;

  const role = normalizePlayerPosition(input.position);
  const roleComposite = computeRoleComposite(role, input.stats, input.scoutlystRating);
  if (roleComposite == null) return null;

  const mins = minutes ?? 0;
  const reliability = computeReliabilityFactor(mins);
  return clampScore(roleComposite * reliability);
}

/** Composite 0–100 performance score from Scoutlyst stats and/or match ratings. */
export function computePlayerPerformanceScore(input: {
  scoutlystRating: number | null;
  matchAvgRating: number | null;
  stats: Record<string, string | number | null>;
  position?: string | null;
}): number | null {
  const composite = computeCompositeScore({
    scoutlystRating: input.scoutlystRating,
    stats: input.stats,
    position: input.position ?? null,
  });

  const legacy = legacyRatingCandidates(input);
  const legacyMax = legacy.length ? Math.max(...legacy) : null;

  if (composite != null && legacyMax != null) {
    return Math.max(composite, legacyMax);
  }
  if (composite != null) return composite;
  if (legacyMax != null) return legacyMax;
  return null;
}
