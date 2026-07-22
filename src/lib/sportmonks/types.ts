/**
 * SportMonks Football API v3 payload types (subset used by GLPM).
 */

export type SmParticipant = {
  id: number;
  name?: string;
  short_code?: string;
  image_path?: string;
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
  /** Finer classification within type_id when present. */
  sub_type_id?: number | null;
  player_id?: number | null;
  related_player_id?: number | null;
  player_name?: string;
  /** Assist (goals) or player off (subs), depending on type_id. */
  related_player_name?: string | null;
  minute?: number | null;
  extra_minute?: number | null;
  sort_order?: number;
  section?: string;
  info?: string | null;
  addition?: string | null;
  result?: string | null;
  type?: { id?: number; name?: string; code?: string };
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

export type SmRound = {
  id?: number;
  name?: string;
};

export type SmLineupDetail = {
  type_id?: number;
  value?: number | string;
  data?: { value?: number | string };
  type?: { id?: number; name?: string; code?: string };
};

export type SmLineup = {
  player_id?: number;
  team_id?: number;
  player_name?: string;
  position_id?: number;
  type_id?: number;
  jersey_number?: number;
  minutes?: number;
  position?: { id?: number; name?: string; code?: string };
  player?: {
    id?: number;
    display_name?: string;
    position?: { id?: number; name?: string; code?: string };
  };
  details?: SmLineupDetail[];
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
  /** xG Basic add-on — fixture-level expected metrics (5304/5305/9686/9687/7943) */
  xGFixture?: SmXgFixtureRow[];
  league?: SmLeague;
  season?: SmSeason;
  venue?: SmVenue;
  state?: SmState;
  round?: SmRound;
  formations?: unknown[];
  lineups?: SmLineup[];
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
  end?: string | null;
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
    end?: string | null;
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
