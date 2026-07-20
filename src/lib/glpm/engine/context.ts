/**
 * Match context multipliers (Chapter 11.7) — TypeScript port.
 */

import type { XgEngineConfig } from "./config";
import type { MatchContext } from "./types";

export function restDaysMultiplier(restDays: number, config: XgEngineConfig): number {
  const days =
    restDays != null && Number.isFinite(restDays)
      ? Number(restDays)
      : config.restBaselineDays;
  let base: number;
  if (days >= 3) base = 1;
  else if (days <= 0) base = 0.85;
  else base = 1 - (3 - days) / 10;

  if (days <= config.congestionDays) {
    base *= config.congestionPenalty;
  }
  return Math.max(0.82, Math.min(1, base));
}

export function travelMultiplier(distanceKm: number, config: XgEngineConfig): number {
  const d = Number.isFinite(distanceKm) ? Number(distanceKm) : 0;
  if (d > config.travelLongKm) return config.travelLongMult;
  if (d > config.travelModerateKm) return config.travelModerateMult;
  return 1;
}

export function homeAdvantageMultiplier(
  isNeutral: boolean,
  config: XgEngineConfig
): number {
  return isNeutral ? 1 : config.homeAdvantage;
}

export function venueAltitudeMultipliers(
  altitudeM: number | null | undefined,
  config: XgEngineConfig
): [number, number] {
  if (altitudeM == null || !Number.isFinite(altitudeM)) return [1, 1];
  if (!(altitudeM > config.altitudeThresholdM)) return [1, 1];
  return [1, config.altitudeAwayPenalty];
}

export type ContextMultipliers = {
  home: number;
  away: number;
  components: Record<string, unknown>;
};

export function resolveContextMultipliers(
  context: MatchContext | null | undefined,
  config: XgEngineConfig
): ContextMultipliers {
  const ctx: MatchContext = context ?? {};

  if (
    ctx.homeContextMultiplier != null &&
    ctx.awayContextMultiplier != null &&
    Number.isFinite(ctx.homeContextMultiplier) &&
    Number.isFinite(ctx.awayContextMultiplier)
  ) {
    return {
      home: Number(ctx.homeContextMultiplier),
      away: Number(ctx.awayContextMultiplier),
      components: {
        override: true,
        home_context_multiplier: Number(ctx.homeContextMultiplier),
        away_context_multiplier: Number(ctx.awayContextMultiplier),
      },
    };
  }

  const isNeutral = Boolean(ctx.isNeutralVenue);
  const haHome = homeAdvantageMultiplier(isNeutral, config);
  const haAway = 1;

  const restHome = restDaysMultiplier(ctx.homeRestDays ?? config.restBaselineDays, config);
  const restAway = restDaysMultiplier(ctx.awayRestDays ?? config.restBaselineDays, config);

  const travelHome = travelMultiplier(ctx.homeTravelKm ?? 0, config);
  const travelAway = travelMultiplier(ctx.awayTravelKm ?? 0, config);

  const [altHome, altAway] = venueAltitudeMultipliers(ctx.venueAltitudeM, config);

  return {
    home: haHome * restHome * travelHome * altHome,
    away: haAway * restAway * travelAway * altAway,
    components: {
      override: false,
      is_neutral_venue: isNeutral,
      home_advantage: haHome,
      away_advantage: haAway,
      home_rest: restHome,
      away_rest: restAway,
      home_travel: travelHome,
      away_travel: travelAway,
      home_altitude: altHome,
      away_altitude: altAway,
      home_rest_days: Number(ctx.homeRestDays ?? config.restBaselineDays),
      away_rest_days: Number(ctx.awayRestDays ?? config.restBaselineDays),
      home_travel_km: Number(ctx.homeTravelKm ?? 0),
      away_travel_km: Number(ctx.awayTravelKm ?? 0),
      venue_altitude_m: ctx.venueAltitudeM ?? null,
    },
  };
}
