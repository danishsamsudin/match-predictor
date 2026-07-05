import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

export const ALTITUDE_ACCLIM_THRESHOLD_M = 1500;
export const ALTITUDE_BETA = 0.00004;
export const ALTITUDE_HOME_FAMILIARITY = 0.01;

function matchAltitudeMeters(m: InternationalFormMatch): number {
  const alt = m.venue_altitude_meters;
  return typeof alt === "number" && Number.isFinite(alt) ? alt : 0;
}

/** Decay-weighted share of recent matches at high altitude (0–1). */
export function computeAltitudeAcclimationScore(
  teamMatches: InternationalFormMatch[],
  asOfMs: number,
  halfLifeDays = 21
): number {
  const decay = Math.log(2) / (halfLifeDays * 24 * 3600 * 1000);
  let weightedHigh = 0;
  let total = 0;

  for (const m of teamMatches) {
    const t = m.date ? new Date(m.date).getTime() : asOfMs;
    if (!Number.isFinite(t) || t > asOfMs) continue;
    const w = Math.exp(-decay * (asOfMs - t));
    total += w;
    if (matchAltitudeMeters(m) >= ALTITUDE_ACCLIM_THRESHOLD_M) {
      weightedHigh += w;
    }
  }

  if (total <= 0) return 0;
  return Math.min(1, weightedHigh / total);
}

export function computeAltitudeGammas(input: {
  venueAltitudeM: number;
  homeAcclimScore: number;
  awayAcclimScore: number;
  pressingIntensityDiff?: number;
}): { gammaHome: number; gammaAway: number } {
  const { venueAltitudeM, homeAcclimScore, awayAcclimScore, pressingIntensityDiff = 0 } = input;

  if (venueAltitudeM <= ALTITUDE_ACCLIM_THRESHOLD_M) {
    return { gammaHome: 1, gammaAway: 1 };
  }

  const excess = venueAltitudeM - ALTITUDE_ACCLIM_THRESHOLD_M;
  const pressPenalty = Math.max(0, pressingIntensityDiff) * 0.02;

  const homeEffect =
    -ALTITUDE_BETA * excess * (1 - homeAcclimScore) - pressPenalty + ALTITUDE_HOME_FAMILIARITY * excess / 1000;
  const awayEffect = -ALTITUDE_BETA * excess * (1 - awayAcclimScore) - pressPenalty;

  return {
    gammaHome: Math.max(0.88, Math.min(1.02, Math.exp(homeEffect))),
    gammaAway: Math.max(0.88, Math.min(1, Math.exp(awayEffect))),
  };
}
