import { getWeatherForecast } from "@/lib/api/weather";
import { buildNationalTeamStatAverages } from "@/lib/data/national-team-stats";
import { computeWeatherImpact } from "@/lib/prediction/weather-impact";
import type { TeamStatAverages, WeatherForecast, WeatherImpactResult } from "@/lib/types/prediction";
import { computeInternationalRatesFromMatches } from "@/lib/world-cup/international-strength";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { normalizePredictorVenueCity } from "@/lib/world-cup/stadium-metadata";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";

export type WcWeatherImpactResult = WeatherImpactResult & {
  forecast: WeatherForecast;
};

function teamStatAveragesFromForm(
  form: InternationalFormMatch[],
  teamId: string,
  teamName: string
): TeamStatAverages {
  const apiTeamId = resolveApiTeamId(teamId, teamName);
  const rates = computeInternationalRatesFromMatches(teamId, form, Date.now(), teamName);
  return buildNationalTeamStatAverages(rates, apiTeamId, teamName);
}

/** Open-Meteo kickoff forecast + national-team weather xG multipliers for Graham WC. */
export async function resolveWcWeatherImpact(input: {
  venueCity: string | null | undefined;
  matchDate: string | null | undefined;
  homeForm: InternationalFormMatch[];
  awayForm: InternationalFormMatch[];
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
}): Promise<WcWeatherImpactResult> {
  const city = normalizePredictorVenueCity(input.venueCity, { defaultWhenUnknown: "Mexico City" });
  const matchDate = input.matchDate?.trim().slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const forecast = await getWeatherForecast(city, matchDate, { allowLive: true });
  const homeStats = teamStatAveragesFromForm(input.homeForm, input.homeTeamId, input.homeName);
  const awayStats = teamStatAveragesFromForm(input.awayForm, input.awayTeamId, input.awayName);
  const impact = computeWeatherImpact(forecast, homeStats, awayStats);

  return { ...impact, forecast };
}
