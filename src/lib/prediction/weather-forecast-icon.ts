import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";

export type WeatherIconKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunder";

const ICON_BY_KIND: Record<WeatherIconKind, LucideIcon> = {
  clear: Sun,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
};

/** Map Open-Meteo WMO weather code to an icon category. */
export function weatherIconKindFromCode(code: number | undefined): WeatherIconKind | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code <= 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

/** Fallback when only the human-readable condition label is available. */
export function weatherIconKindFromCondition(condition: string | undefined): WeatherIconKind {
  const text = (condition ?? "").toLowerCase();
  if (!text || text.includes("unavailable") || text === "unknown") return "partly-cloudy";
  if (text.includes("thunder") || text.includes("hail")) return "thunder";
  if (text.includes("snow")) return "snow";
  if (text.includes("rain") || text.includes("drizzle") || text.includes("shower")) return "rain";
  if (text.includes("fog")) return "fog";
  if (text.includes("overcast")) return "cloudy";
  if (text.includes("partly")) return "partly-cloudy";
  if (text.includes("clear") || text.includes("sunny") || text.includes("fair")) return "clear";
  if (text.includes("cloud")) return "cloudy";
  return "partly-cloudy";
}

export function resolveWeatherIconKind(input: {
  weatherCode?: number;
  condition?: string;
}): WeatherIconKind {
  return (
    weatherIconKindFromCode(input.weatherCode) ??
    weatherIconKindFromCondition(input.condition)
  );
}

export function weatherIconComponent(kind: WeatherIconKind): LucideIcon {
  return ICON_BY_KIND[kind];
}
