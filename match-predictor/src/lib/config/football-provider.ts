import { serverEnv } from "@/lib/env/server-env";

export type FootballProvider = "sportapi7" | "api-football";

export function getFootballProvider(): FootballProvider {
  const raw = serverEnv.footballProvider?.toLowerCase();
  if (raw === "api-football" || raw === "apisports") return "api-football";
  // Allow FOOTBALL_PROVIDER=sportapi7.p.rapidapi.com (host) as well as sportapi7
  if (raw?.includes("rapidapi.com")) return "sportapi7";
  return "sportapi7";
}

export function usesSportApi(): boolean {
  return getFootballProvider() === "sportapi7";
}

export { getRapidApiKey, getRapidApiKey as getFootballApiKey } from "@/lib/config/rapidapi";
