import { normalizeRapidApiHost } from "@/lib/config/rapidapi";
import { serverEnv } from "@/lib/env/server-env";

export type FootballApiProviderName = "sofascore" | "sportapi7";

const DEFAULT_PRIMARY = "sofascore.p.rapidapi.com";
const DEFAULT_SECONDARY = "sportapi7.p.rapidapi.com";

export function getPrimaryFootballHost(): string {
  return (
    normalizeRapidApiHost(serverEnv.footballPrimaryProvider) ??
    normalizeRapidApiHost(process.env.FOOTBALL_PROVIDER) ??
    DEFAULT_PRIMARY
  );
}

export function getSecondaryFootballHost(): string {
  return (
    normalizeRapidApiHost(serverEnv.footballSecondaryProvider) ??
    DEFAULT_SECONDARY
  );
}

export function getPrimaryProviderName(): FootballApiProviderName {
  const host = getPrimaryFootballHost();
  if (host.includes("sportapi7")) return "sportapi7";
  return "sofascore";
}

export function getSecondaryProviderName(): FootballApiProviderName {
  const host = getSecondaryFootballHost();
  if (host.includes("sportapi7")) return "sportapi7";
  return "sofascore";
}

export function getFootballProvider(): FootballApiProviderName {
  return getPrimaryProviderName();
}

export function usesSportApi(): boolean {
  return getPrimaryProviderName() === "sportapi7";
}
