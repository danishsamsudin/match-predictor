import type { WeatherForecast } from "@/lib/types/prediction";

export function getMockWeatherForecast(city: string): WeatherForecast {
  void city;
  return {
    condition: "Partly cloudy",
    tempC: 18,
    humidity: 55,
    windKph: 12,
    precipMm: 0,
    lat: 53.48,
    lon: -2.24,
  };
}

export interface WeatherApiResponse {
  list: Array<{
    dt: number;
    dt_txt: string;
    main: {
      temp: number;
      humidity: number;
    };
    weather: Array<{ main: string; description: string }>;
    wind: { speed: number };
    rain?: { "1h"?: number; "3h"?: number };
  }>;
  city: {
    name: string;
    coord: { lat: number; lon: number };
  };
}

export function getMockWeatherApiResponse(city: string, date: string): WeatherApiResponse {
  const dtTxt = `${date} 15:00:00`;
  return {
    city: { name: city, coord: { lat: 53.48, lon: -2.24 } },
    list: [
      {
        dt: Math.floor(new Date(dtTxt.replace(" ", "T")).getTime() / 1000),
        dt_txt: dtTxt,
        main: { temp: 18, humidity: 55 },
        weather: [{ main: "Clouds", description: "Partly cloudy" }],
        wind: { speed: 3.33 },
        rain: { "3h": 0 },
      },
    ],
  };
}
