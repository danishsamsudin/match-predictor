import type { SoccerdataSourceMeta } from "@/lib/api/soccerdata/types";

const DOCS = "https://soccerdata.readthedocs.io/en/latest";

/** Catalog mirrors soccerdata.readthedocs.io data sources and read_* APIs. */
export const SOCCERDATA_SOURCE_CATALOG: SoccerdataSourceMeta[] = [
  {
    id: "ClubElo",
    label: "ClubElo",
    description: "Team Elo ratings (clubelo.com). No league filter on the source.",
    docsUrl: `${DOCS}/reference/clubelo.html`,
    requiresLeagues: false,
    methods: [
      { name: "available_leagues", description: "Leagues covered (mostly empty for ClubElo).", classMethod: true },
      { name: "read_by_date", description: "Elo for all teams on a date.", params: { date: "YYYY-MM-DD (optional)" } },
      {
        name: "read_team_history",
        description: "Full Elo history for one club.",
        params: { team: "Club name (required)", max_age: "Cache max age in days (optional)" },
      },
    ],
  },
  {
    id: "ESPN",
    label: "ESPN",
    description: "Schedules, match sheets, and lineups from ESPN.",
    docsUrl: `${DOCS}/reference/espn.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_schedule", description: "Fixture schedule.", params: { force_cache: "boolean (optional)" } },
      { name: "read_matchsheet", description: "Match sheets.", params: { match_id: "int or int[] (optional)" } },
      { name: "read_lineup", description: "Lineups.", params: { match_id: "int or int[] (optional)" } },
    ],
  },
  {
    id: "FBref",
    label: "FBref",
    description: "Opta-based team/player stats, schedules, events, and lineups.",
    docsUrl: `${DOCS}/reference/fbref.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_leagues", description: "League metadata.", params: { split_up_big5: "boolean (optional)" } },
      { name: "read_seasons", description: "Season metadata.", params: { split_up_big5: "boolean (optional)" } },
      {
        name: "read_team_season_stats",
        description: "Aggregated team season stats.",
        params: { stat_type: "standard|keeper|shooting|playing_time|misc", opponent_stats: "boolean (optional)" },
      },
      {
        name: "read_team_match_stats",
        description: "Per-match team logs.",
        params: {
          stat_type: "schedule|keeper|shooting|misc",
          opponent_stats: "boolean (optional)",
          team: "string or string[] (optional)",
          force_cache: "boolean (optional)",
        },
      },
      {
        name: "read_player_season_stats",
        description: "Player season aggregates.",
        params: { stat_type: "standard|shooting|playing_time|keeper|misc" },
      },
      { name: "read_schedule", description: "Fixtures.", params: { force_cache: "boolean (optional)" } },
      {
        name: "read_player_match_stats",
        description: "Player match stats.",
        params: { stat_type: "summary|keepers", match_id: "int or int[] (optional)", force_cache: "boolean (optional)" },
      },
      {
        name: "read_lineup",
        description: "Lineups.",
        params: { match_id: "int or int[] (optional)", force_cache: "boolean (optional)" },
      },
      {
        name: "read_events",
        description: "Goals, cards, substitutions.",
        params: { match_id: "int or int[] (optional)", force_cache: "boolean (optional)" },
      },
    ],
  },
  {
    id: "MatchHistory",
    label: "Football-Data.co.uk",
    description: "Historical results, odds, and match statistics (CSV).",
    docsUrl: `${DOCS}/reference/matchhistory.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_games", description: "Full game history for selected leagues/seasons." },
    ],
  },
  {
    id: "Sofascore",
    label: "Sofascore (soccerdata)",
    description: "Schedules and tables via soccerdata scraper (separate from RapidAPI SofaScore).",
    docsUrl: `${DOCS}/reference/sofascore.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_leagues", description: "League metadata." },
      { name: "read_seasons", description: "Season metadata." },
      { name: "read_league_table", description: "Standings.", params: { force_cache: "boolean (optional)" } },
      { name: "read_schedule", description: "Fixtures.", params: { force_cache: "boolean (optional)" } },
    ],
  },
  {
    id: "SoFIFA",
    label: "SoFIFA",
    description: "EA FC player and team ability ratings.",
    docsUrl: `${DOCS}/reference/sofifa.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_leagues", description: "League metadata." },
      { name: "read_versions", description: "FIFA release versions.", params: { max_age: "days (optional)" } },
      { name: "read_teams", description: "Teams in selected leagues." },
      { name: "read_players", description: "Players.", params: { team: "string or string[] (optional)" } },
      { name: "read_team_ratings", description: "Team ratings." },
      {
        name: "read_player_ratings",
        description: "Player ratings.",
        params: { team: "string or string[] (optional)", player: "int or int[] (optional)" },
      },
    ],
  },
  {
    id: "Understat",
    label: "Understat",
    description: "xG, shot events, and advanced metrics for top European leagues.",
    docsUrl: `${DOCS}/reference/understat.html`,
    requiresLeagues: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_leagues", description: "League metadata." },
      { name: "read_seasons", description: "Season metadata." },
      {
        name: "read_schedule",
        description: "Fixtures.",
        params: { include_matches_without_data: "boolean (optional)", force_cache: "boolean (optional)" },
      },
      { name: "read_team_match_stats", description: "Team match stats.", params: { force_cache: "boolean (optional)" } },
      { name: "read_player_season_stats", description: "Player season stats.", params: { force_cache: "boolean (optional)" } },
      { name: "read_player_match_stats", description: "Player match stats.", params: { match_id: "int or int[] (optional)" } },
      { name: "read_shot_events", description: "Shot-level xG events.", params: { match_id: "int or int[] (optional)" } },
    ],
  },
  {
    id: "WhoScored",
    label: "WhoScored",
    description: "Schedules, missing players, and Opta event streams. Requires Chrome + Selenium.",
    docsUrl: `${DOCS}/reference/whoscored.html`,
    requiresLeagues: true,
    requiresChrome: true,
    methods: [
      { name: "available_leagues", description: "Supported league IDs.", classMethod: true },
      { name: "read_schedule", description: "Fixtures.", params: { force_cache: "boolean (optional)" } },
      {
        name: "read_missing_players",
        description: "Injuries/suspensions.",
        params: { match_id: "int or int[] (optional)", force_cache: "boolean (optional)" },
      },
      {
        name: "read_events",
        description: "Match events (events|raw|spadl|atomic-spadl).",
        params: {
          match_id: "int or int[] (optional)",
          force_cache: "boolean (optional)",
          live: "boolean (optional)",
          output_fmt: "events|raw|spadl|atomic-spadl (optional)",
          on_error: "raise|skip (optional)",
        },
      },
    ],
  },
];

export function getSoccerdataSourceMeta(source: string): SoccerdataSourceMeta | undefined {
  return SOCCERDATA_SOURCE_CATALOG.find((s) => s.id === source);
}

export function assertSoccerdataMethod(source: string, method: string): void {
  const meta = getSoccerdataSourceMeta(source);
  if (!meta) {
    throw new Error(`Unknown soccerdata source: ${source}`);
  }
  if (!meta.methods.some((m) => m.name === method)) {
    throw new Error(`Method '${method}' is not registered for source '${source}'.`);
  }
}
