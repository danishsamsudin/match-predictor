export interface CountryOption {
  name: string;
  code: string;
}

export interface LeagueOption {
  id: number;
  name: string;
  country: string;
  season: number;
  type: string;
}

export interface TeamOption {
  id: number;
  name: string;
  logo?: string;
}

export interface FixtureOption {
  id: number;
  date: string;
  venueCity: string;
  league: { id: number; name: string; season: number };
  home: { id: number; name: string };
  away: { id: number; name: string };
}
