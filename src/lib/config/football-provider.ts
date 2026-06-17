export type FootballProvider = "sportapi7" | "sofascore" | "api-football";

export {
  getFootballProvider,
  getPrimaryFootballHost,
  getPrimaryProviderName,
  getSecondaryFootballHost,
  getSecondaryProviderName,
  usesSportApi,
} from "@/lib/config/football-providers";

export { getRapidApiKey, getRapidApiKey as getFootballApiKey } from "@/lib/config/rapidapi";
