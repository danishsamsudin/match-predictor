/**
 * Known coordinate / city corrections researched from Wikipedia / Wikidata / OSM.
 * Used when SportMonks venue payload is missing or incomplete.
 *
 * Hitachi Capital Mobility Stadium is the sponsored name for Euroborg (FC Groningen).
 * Coords: Wikipedia Euroborg 53°12′22″N 6°35′29″E → 53.20611, 6.59139
 * https://en.wikipedia.org/wiki/Euroborg
 */
export const GLPM_VENUE_LOCATION_OVERRIDES: Record<
  number,
  {
    latitude: number;
    longitude: number;
    cityName?: string;
    countryName?: string;
    source: string;
    sourceNotes: string;
  }
> = {
  // Hitachi Capital Mobility Stadium (Euroborg rename) — SportMonks id 338881 had null coords
  338881: {
    latitude: 53.20611,
    longitude: 6.59139,
    cityName: "Groningen",
    countryName: "Netherlands",
    source: "wikipedia",
    sourceNotes: "Euroborg / Hitachi Capital Mobility Stadion — Wikipedia Q1374804",
  },
  // Hill Dickinson Stadium (Everton) — SportMonks missing city_name
  343762: {
    latitude: 53.42499,
    longitude: -3.00275,
    cityName: "Liverpool",
    countryName: "England",
    source: "sportmonks",
    sourceNotes: "City filled from Bramley-Moore Dock / Everton stadium location",
  },
  // Kooi Stadion (SC Cambuur) — SportMonks missing city_name
  343504: {
    latitude: 53.2051487,
    longitude: 5.7712702,
    cityName: "Leeuwarden",
    countryName: "Netherlands",
    source: "sportmonks",
    sourceNotes: "City filled for Cambuur home ground (Kooi Stadion)",
  },
};

export const GLPM_COUNTRY_ID_NAMES: Record<number, string> = {
  11: "Germany",
  38: "Netherlands",
  251: "Italy",
  462: "England",
  515: "Wales",
};
