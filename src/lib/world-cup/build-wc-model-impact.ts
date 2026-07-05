import type { PredictionAnalytics } from "@/lib/types/prediction";

function snapNum(snapshot: Record<string, unknown>, key: string, fallback = 1): number {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function snapStr(snapshot: Record<string, unknown>, key: string): string | undefined {
  const v = snapshot[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Per-factor xG multipliers for the WC Graham hub (mirrors club predictor breakdown). */
export function buildWcGrahamModelImpact(
  snapshot: Record<string, unknown>
): PredictionAnalytics["modelImpact"] {
  const lineupHome = snapNum(snapshot, "lineup_home_xg_mult");
  const lineupAway = snapNum(snapshot, "lineup_away_xg_mult");
  const weatherCondition = snapStr(snapshot, "weather_condition");
  const weatherCode = snapshot.weather_code;
  const weatherTemp = snapshot.weather_temp_c;

  return [
    {
      label: "Altitude acclimation",
      homeMultiplier: snapNum(snapshot, "gamma_home"),
      awayMultiplier: snapNum(snapshot, "gamma_away"),
    },
    {
      label: "Host nation",
      homeMultiplier: snapNum(snapshot, "host_nation_boost"),
      awayMultiplier: 1,
    },
    {
      label: "Travel & jet lag",
      homeMultiplier: snapNum(snapshot, "delta_final_home"),
      awayMultiplier: snapNum(snapshot, "delta_final_away"),
    },
    {
      label: "Weather",
      homeMultiplier: snapNum(snapshot, "weather_home_xg_mult"),
      awayMultiplier: snapNum(snapshot, "weather_away_xg_mult"),
      forecast: weatherCondition
        ? {
            condition: weatherCondition,
            weatherCode:
              typeof weatherCode === "number" && Number.isFinite(weatherCode)
                ? weatherCode
                : undefined,
            tempC:
              typeof weatherTemp === "number" && Number.isFinite(weatherTemp)
                ? weatherTemp
                : undefined,
          }
        : undefined,
    },
    {
      label: "Lineup",
      homeMultiplier: lineupHome,
      awayMultiplier: lineupAway,
    },
  ];
}
