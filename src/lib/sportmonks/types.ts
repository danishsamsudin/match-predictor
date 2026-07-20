/**
 * SportMonks Football API v3 payload types (subset used by GLPM).
 */

export type SmParticipant = {
  id: number;
  name?: string;
  short_code?: string;
  meta?: { location?: "home" | "away"; winner?: boolean | null };
};

export type SmScore = {
  id?: number;
  fixture_id?: number;
  type_id?: number;
  participant_id?: number;
  score?: { goals?: number; participant?: string };
  description?: string;
};

export type SmStatistic = {
  id?: number;
  fixture_id?: number;
  type_id: number;
  participant_id: number;
  data?: { value?: number | string | null };
  value?: number | string | null;
  location?: string;
};

export type SmEvent = {
  id: number;
  fixture_id?: number;
  period_id?: number;
  participant_id?: number | null;
  type_id?: number;
  player_id?: number | null;
  related_player_id?: number | null;
  player_name?: string;
  minute?: number | null;
  extra_minute?: number | null;
  sort_order?: number;
  section?: string;
  info?: string | null;
  addition?: string | null;
};

export type SmXgFixtureRow = {
  id?: number;
  fixture_id?: number;
  type_id?: number;
  participant_id?: number;
  data?: { value?: number | string | null };
  value?: number | string | null;
};

export type SmLeague = {
  id: number;
  name?: string;
  country_id?: number;
  short_code?: string;
};

export type SmSeason = {
  id: number;
  name?: string;
  league_id?: number;
  starting_at?: string;
  ending_at?: string;
  is_current?: boolean;
};

export type SmVenue = {
  id?: number;
  name?: string;
  city_name?: string;
  capacity?: number;
};

export type SmState = {
  id?: number;
  state?: string;
  name?: string;
  short_name?: string;
};

export type SmFixture = {
  id: number;
  sport_id?: number;
  league_id?: number;
  season_id?: number;
  stage_id?: number;
  round_id?: number;
  state_id?: number;
  venue_id?: number;
  name?: string;
  starting_at?: string;
  result_info?: string | null;
  leg?: string;
  length?: number;
  participants?: SmParticipant[];
  scores?: SmScore[];
  statistics?: SmStatistic[];
  events?: SmEvent[];
  /** Premium include — not on our plan; do not request. Prefer statistics + shot proxy. */
  xGFixture?: SmXgFixtureRow[];
  league?: SmLeague;
  season?: SmSeason;
  venue?: SmVenue;
  state?: SmState;
  formations?: unknown[];
  lineups?: unknown[];
  [key: string]: unknown;
};

export type SmPagination = {
  count?: number;
  per_page?: number;
  current_page?: number;
  next_cursor?: string | null;
  has_more?: boolean;
};

export type SmApiResponse<T> = {
  data: T;
  pagination?: SmPagination;
  rate_limit?: {
    remaining?: number;
    resets_in_seconds?: number;
  };
};

export type SmNamedEntity = {
  id: number;
  name?: string;
  common_name?: string;
  firstname?: string;
  lastname?: string;
  display_name?: string;
};

export type SmPlayerTeamLink = {
  id?: number;
  team_id?: number;
  player_id?: number;
  jersey_number?: number;
  start?: string;
  end?: string;
  captain?: boolean;
  team?: SmTeam;
};

export type SmPlayer = SmNamedEntity & {
  sport_id?: number;
  country_id?: number;
  nationality_id?: number;
  city_id?: number;
  position_id?: number;
  detailed_position_id?: number;
  type_id?: number;
  date_of_birth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  image_path?: string;
  foot?: string;
  status?: string;
  country?: { id?: number; name?: string; iso2?: string };
  nationality?: { id?: number; name?: string; iso2?: string };
  city?: { id?: number; name?: string };
  position?: { id?: number; name?: string; code?: string; developer_name?: string };
  detailedPosition?: { id?: number; name?: string; code?: string; developer_name?: string };
  teams?: SmPlayerTeamLink[];
  statistics?: unknown[];
  lineups?: unknown[];
  latest?: unknown[];
  trophies?: unknown[];
  metadata?: unknown[];
  transfers?: unknown[];
  pendingTransfers?: unknown[];
  [key: string]: unknown;
};

export type SmCoach = SmNamedEntity & {
  sport_id?: number;
  country_id?: number;
  nationality_id?: number;
  date_of_birth?: string;
  gender?: string;
  image_path?: string;
  teams?: Array<{
    id?: number;
    team_id?: number;
    coach_id?: number;
    start?: string;
    end?: string;
    active?: boolean;
    team?: SmTeam;
  }>;
  [key: string]: unknown;
};

export type SmTeam = SmNamedEntity & {
  sport_id?: number;
  country_id?: number;
  venue_id?: number;
  gender?: string;
  founded?: number;
  type?: string;
  placeholder?: boolean;
  last_played_at?: string;
  short_code?: string;
  image_path?: string;
  country?: { id?: number; name?: string; iso2?: string };
  venue?: SmVenue & { city_name?: string };
  coaches?: SmCoach[];
  [key: string]: unknown;
};
