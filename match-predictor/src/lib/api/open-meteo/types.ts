export interface OpenMeteoGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

export interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[];
  error?: boolean;
  reason?: string;
}

export interface OpenMeteoHourlyForecast {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  precipitation: number[];
  weather_code: number[];
  wind_speed_10m: number[];
}

export interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: OpenMeteoHourlyForecast;
  error?: boolean;
  reason?: string;
}

/** Cached payload stored in api_cache for a city + date weather lookup. */
export interface OpenMeteoWeatherCachePayload {
  provider: "open-meteo";
  version: string;
  location: OpenMeteoGeocodingResult;
  forecast: OpenMeteoForecastResponse;
}
