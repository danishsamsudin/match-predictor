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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["predictions"]["Insert"]>;
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
