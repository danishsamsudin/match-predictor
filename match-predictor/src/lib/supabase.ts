import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return url.replace(/\/rest\/v1\/?$/, "");
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return key;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return key;
}

export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function tryCreateServiceClient(): SupabaseClient<Database> | null {
  if (!hasServiceRoleKey()) {
    return null;
  }
  return createServiceClient();
}

export type Database = {
  public: {
    Tables: {
      api_cache: {
        Row: {
          cache_key: string;
          provider: "football" | "weather";
          response: unknown;
          fetched_at: string;
          expires_at: string;
        };
        Insert: {
          cache_key: string;
          provider: "football" | "weather";
          response: unknown;
          fetched_at?: string;
          expires_at: string;
        };
        Update: Partial<{
          response: unknown;
          fetched_at: string;
          expires_at: string;
        }>;
        Relationships: [];
      };
      api_usage_daily: {
        Row: {
          provider: "football" | "weather";
          usage_date: string;
          call_count: number;
        };
        Insert: {
          provider: "football" | "weather";
          usage_date?: string;
          call_count?: number;
        };
        Update: Partial<{ call_count: number }>;
        Relationships: [];
      };
      data_sync_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "failed";
          football_api_calls: number;
          weather_api_calls: number;
          leagues_synced: number;
          fixtures_synced: number;
          bundles_synced: number;
          error_message: string | null;
          details: unknown;
          primary_provider: string | null;
          secondary_fallback_calls: number;
        };
        Insert: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: "running" | "success" | "failed";
          football_api_calls?: number;
          weather_api_calls?: number;
          leagues_synced?: number;
          fixtures_synced?: number;
          bundles_synced?: number;
          error_message?: string | null;
          details?: unknown;
          primary_provider?: string | null;
          secondary_fallback_calls?: number;
        };
        Update: Partial<Database["public"]["Tables"]["data_sync_runs"]["Insert"]>;
        Relationships: [];
      };
      data_sync_state: {
        Row: {
          id: number;
          last_success_at: string | null;
          next_sync_after: string | null;
          last_run_id: string | null;
          last_sync_date: string | null;
          sync_hour_utc: number | null;
        };
        Insert: {
          id?: number;
          last_success_at?: string | null;
          next_sync_after?: string | null;
          last_run_id?: string | null;
          last_sync_date?: string | null;
          sync_hour_utc?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["data_sync_state"]["Insert"]>;
        Relationships: [];
      };
      football_api_daily: {
        Row: {
          usage_date: string;
          call_count: number;
          last_provider: string | null;
          last_endpoint: string | null;
          updated_at: string;
        };
        Insert: {
          usage_date?: string;
          call_count?: number;
          last_provider?: string | null;
          last_endpoint?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["football_api_daily"]["Insert"]>;
        Relationships: [];
      };
      football_api_call_log: {
        Row: {
          id: number;
          usage_date: string;
          provider: string;
          endpoint: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          usage_date?: string;
          provider: string;
          endpoint: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["football_api_call_log"]["Insert"]>;
        Relationships: [];
      };
      synced_api_payloads: {
        Row: {
          provider: string;
          endpoint: string;
          entity_type: string;
          entity_key: string;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          provider: string;
          endpoint: string;
          entity_type: string;
          entity_key: string;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_api_payloads"]["Insert"]>;
        Relationships: [];
      };
      synced_seasons: {
        Row: {
          unique_tournament_id: number;
          season_id: number;
          season_name: string | null;
          season_year: string | null;
          reference_league_id: number | null;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          unique_tournament_id: number;
          season_id: number;
          season_name?: string | null;
          season_year?: string | null;
          reference_league_id?: number | null;
          payload?: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_seasons"]["Insert"]>;
        Relationships: [];
      };
      synced_tournaments: {
        Row: {
          unique_tournament_id: number;
          reference_league_id: number | null;
          name: string;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          unique_tournament_id: number;
          reference_league_id?: number | null;
          name: string;
          payload?: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_tournaments"]["Insert"]>;
        Relationships: [];
      };
      synced_standings: {
        Row: {
          unique_tournament_id: number;
          season_id: number;
          reference_league_id: number;
          standing_type: string;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          unique_tournament_id: number;
          season_id: number;
          reference_league_id: number;
          standing_type?: string;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_standings"]["Insert"]>;
        Relationships: [];
      };
      synced_events: {
        Row: {
          event_id: number;
          unique_tournament_id: number;
          season_id: number | null;
          reference_league_id: number;
          kickoff_at: string | null;
          status_type: string | null;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          unique_tournament_id: number;
          season_id?: number | null;
          reference_league_id: number;
          kickoff_at?: string | null;
          status_type?: string | null;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_events"]["Insert"]>;
        Relationships: [];
      };
      synced_event_statistics: {
        Row: {
          event_id: number;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_event_statistics"]["Insert"]>;
        Relationships: [];
      };
      synced_event_lineups: {
        Row: {
          event_id: number;
          payload: unknown;
          confirmed: boolean | null;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          payload: unknown;
          confirmed?: boolean | null;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_event_lineups"]["Insert"]>;
        Relationships: [];
      };
      synced_event_incidents: {
        Row: {
          event_id: number;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_event_incidents"]["Insert"]>;
        Relationships: [];
      };
      synced_event_h2h: {
        Row: {
          event_id: number;
          payload: unknown;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          payload: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_event_h2h"]["Insert"]>;
        Relationships: [];
      };
      synced_team_statistics: {
        Row: {
          team_id: number;
          unique_tournament_id: number;
          season_id: number;
          reference_league_id: number;
          payload: unknown;
          metrics_home: unknown | null;
          metrics_away: unknown | null;
          synced_at: string;
        };
        Insert: {
          team_id: number;
          unique_tournament_id: number;
          season_id: number;
          reference_league_id: number;
          payload: unknown;
          metrics_home?: unknown | null;
          metrics_away?: unknown | null;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_team_statistics"]["Insert"]>;
        Relationships: [];
      };
      sync_league_state: {
        Row: {
          reference_league_id: number;
          last_teams_sync_at: string | null;
          last_fixtures_sync_at: string | null;
          next_sync_after: string | null;
        };
        Insert: {
          reference_league_id: number;
          last_teams_sync_at?: string | null;
          last_fixtures_sync_at?: string | null;
          next_sync_after?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sync_league_state"]["Insert"]>;
        Relationships: [];
      };
      synced_teams: {
        Row: {
          league_id: number;
          team_id: number;
          team_name: string;
          short_name: string | null;
          slug: string | null;
          entity_type: string;
          unique_tournament_id: number | null;
          season_id: number | null;
          synced_at: string;
        };
        Insert: {
          league_id: number;
          team_id: number;
          team_name: string;
          short_name?: string | null;
          slug?: string | null;
          entity_type?: string;
          unique_tournament_id?: number | null;
          season_id?: number | null;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_teams"]["Insert"]>;
        Relationships: [];
      };
      synced_fixtures: {
        Row: {
          event_id: number;
          league_id: number;
          league_name: string;
          season: number;
          kickoff_at: string;
          venue_city: string;
          home_team_id: number;
          home_team_name: string;
          away_team_id: number;
          away_team_name: string;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          league_id: number;
          league_name: string;
          season: number;
          kickoff_at: string;
          venue_city: string;
          home_team_id: number;
          home_team_name: string;
          away_team_id: number;
          away_team_name: string;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_fixtures"]["Insert"]>;
        Relationships: [];
      };
      synced_match_bundles: {
        Row: {
          match_id: number;
          league_id: number;
          home_team_id: number;
          away_team_id: number;
          bundle: unknown;
          synced_at: string;
        };
        Insert: {
          match_id: number;
          league_id: number;
          home_team_id: number;
          away_team_id: number;
          bundle: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_match_bundles"]["Insert"]>;
        Relationships: [];
      };
      synced_weather: {
        Row: {
          city_key: string;
          forecast_date: string;
          forecast: unknown;
          synced_at: string;
        };
        Insert: {
          city_key: string;
          forecast_date: string;
          forecast: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_weather"]["Insert"]>;
        Relationships: [];
      };
      synced_player_ratings: {
        Row: {
          player_id: number;
          club_avg_rating: number | null;
          sample_size: number;
          ratings: unknown;
          synced_at: string;
        };
        Insert: {
          player_id: number;
          club_avg_rating?: number | null;
          sample_size?: number;
          ratings?: unknown;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["synced_player_ratings"]["Insert"]>;
        Relationships: [];
      };
      predictions: {
        Row: {
          id: string;
          match_id: number;
          home_team_id: number;
          away_team_id: number;
          city: string;
          match_date: string;
          home_win_pct: number;
          away_win_pct: number;
          draw_pct: number;
          home_xg: number;
          away_xg: number;
          estimated_corners: number;
          estimated_fouls: number;
          estimated_yellow_cards: number;
          estimated_red_cards: number;
          explanation: string;
          inputs_snapshot: unknown;
          entity_type: string | null;
          home_league_id: number | null;
          away_league_id: number | null;
          comparison_mode: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: number;
          home_team_id: number;
          away_team_id: number;
          city: string;
          match_date: string;
          home_win_pct: number;
          away_win_pct: number;
          draw_pct: number;
          home_xg: number;
          away_xg: number;
          estimated_corners: number;
          estimated_fouls: number;
          estimated_yellow_cards: number;
          estimated_red_cards: number;
          explanation: string;
          inputs_snapshot?: unknown;
          entity_type?: string | null;
          home_league_id?: number | null;
          away_league_id?: number | null;
          comparison_mode?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["predictions"]["Insert"]>;
        Relationships: [];
      };
      soccerdata_event_enrichments: {
        Row: {
          event_id: number;
          league_id: number | null;
          season: number | null;
          xg_home: number | null;
          xg_away: number | null;
          odds_home: number | null;
          odds_draw: number | null;
          odds_away: number | null;
          payload: unknown | null;
          synced_at: string;
        };
        Insert: {
          event_id: number;
          league_id?: number | null;
          season?: number | null;
          xg_home?: number | null;
          xg_away?: number | null;
          odds_home?: number | null;
          odds_draw?: number | null;
          odds_away?: number | null;
          payload?: unknown | null;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["soccerdata_event_enrichments"]["Insert"]>;
        Relationships: [];
      };
      soccerdata_match_links: {
        Row: {
          event_id: number;
          league_id: number;
          source: string;
          soccerdata_match_key: string;
          kickoff_at: string | null;
          home_team_id: number | null;
          away_team_id: number | null;
          confidence: number;
          linked_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          event_id: number;
          league_id: number;
          source: string;
          soccerdata_match_key: string;
          kickoff_at?: string | null;
          home_team_id?: number | null;
          away_team_id?: number | null;
          confidence?: number;
          linked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["soccerdata_match_links"]["Insert"]>;
        Relationships: [];
      };
      soccerdata_player_links: {
        Row: {
          player_id: number;
          source: string;
          soccerdata_player_key: string;
          confidence: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          player_id: number;
          source: string;
          soccerdata_player_key: string;
          confidence?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["soccerdata_player_links"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "soccerdata_player_links_player_id_fkey";
            columns: ["player_id"];
            referencedRelation: "soccerdata_players";
            referencedColumns: ["id"];
          },
        ];
      };
      soccerdata_players: {
        Row: {
          id: number;
          name: string;
          league_id: number | null;
          team_id: number | null;
          position: string | null;
          country: string | null;
          birth_date: string | null;
          sofifa_overall: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          league_id?: number | null;
          team_id?: number | null;
          position?: string | null;
          country?: string | null;
          birth_date?: string | null;
          sofifa_overall?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["soccerdata_players"]["Insert"]>;
        Relationships: [];
      };
      scoutlyst_import_batches: {
        Row: {
          id: number;
          file_name: string;
          snapshot_date: string;
          rows_imported: number;
          rows_linked: number;
          status: string;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          file_name: string;
          snapshot_date: string;
          rows_imported?: number;
          rows_linked?: number;
          status?: string;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scoutlyst_import_batches"]["Insert"]>;
        Relationships: [];
      };
      scoutlyst_player_links: {
        Row: {
          scoutlyst_player_key: string;
          player_name: string;
          reference_team_id: number | null;
          sofascore_player_id: number | null;
          confidence: number;
          linked_at: string | null;
          updated_at: string;
        };
        Insert: {
          scoutlyst_player_key: string;
          player_name: string;
          reference_team_id?: number | null;
          sofascore_player_id?: number | null;
          confidence?: number;
          linked_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scoutlyst_player_links"]["Insert"]>;
        Relationships: [];
      };
      scoutlyst_player_snapshots: {
        Row: {
          scoutlyst_player_key: string;
          snapshot_date: string;
          player_name: string;
          team_name: string | null;
          league_name: string | null;
          reference_league_id: number | null;
          reference_team_id: number | null;
          sofascore_player_id: number | null;
          position: string | null;
          age: number | null;
          rating: number | null;
          stats: Record<string, unknown>;
          import_batch_id: number | null;
          imported_at: string;
        };
        Insert: {
          scoutlyst_player_key: string;
          snapshot_date: string;
          player_name: string;
          team_name?: string | null;
          league_name?: string | null;
          reference_league_id?: number | null;
          reference_team_id?: number | null;
          sofascore_player_id?: number | null;
          position?: string | null;
          age?: number | null;
          rating?: number | null;
          stats?: Record<string, unknown>;
          import_batch_id?: number | null;
          imported_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scoutlyst_player_snapshots"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "scoutlyst_player_snapshots_import_batch_id_fkey";
            columns: ["import_batch_id"];
            referencedRelation: "scoutlyst_import_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      soccerdata_team_aliases: {
        Row: {
          league_id: number;
          team_id: number;
          source: string;
          soccerdata_team_name: string;
          normalized_team_name: string;
          confidence: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          league_id: number;
          team_id: number;
          source: string;
          soccerdata_team_name: string;
          normalized_team_name: string;
          confidence?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["soccerdata_team_aliases"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let browserClient: SupabaseClient<Database> | null = null;
let serverClient: SupabaseClient<Database> | null = null;
let serviceClient: SupabaseClient<Database> | null = null;

export function createBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createClient<Database>(getSupabaseUrl(), getAnonKey());
  }
  return browserClient;
}

export function createServerClient(): SupabaseClient<Database> {
  if (!serverClient) {
    serverClient = createClient<Database>(getSupabaseUrl(), getAnonKey());
  }
  return serverClient;
}

export function createServiceClient(): SupabaseClient<Database> {
  if (!serviceClient) {
    serviceClient = createClient<Database>(getSupabaseUrl(), getServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}
