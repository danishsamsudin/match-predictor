import { tryCreateServiceClient } from "@/lib/supabase";

export type FbrefTeamRow = { id: string; name: string };
export type FbrefPlayerRow = {
  id: string;
  name: string;
  current_team_id: string | null;
};
export type FbrefPlayerStatRow = {
  id: string;
  player_id: string;
  team_id: string;
  stat_type: string;
  competition: string | null;
  stats: Record<string, unknown>;
};
export type FbrefMatchRow = {
  id: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  competition: string | null;
  home_goals: number | null;
  away_goals: number | null;
};

export function fbrefStoreAvailable(): boolean {
  return Boolean(tryCreateServiceClient());
}

export async function listFbrefTeams(): Promise<FbrefTeamRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listFbrefPlayersForTeam(teamId: string): Promise<FbrefPlayerRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const { data: byRoster, error: rosterError } = await supabase
    .from("players")
    .select("id, name, current_team_id")
    .eq("current_team_id", teamId)
    .order("name");
  if (rosterError) throw rosterError;
  if (byRoster?.length) return byRoster;

  const { data: statRows, error: statsError } = await supabase
    .from("player_season_stats")
    .select("player_id")
    .eq("team_id", teamId);
  if (statsError) throw statsError;

  const playerIds = [...new Set((statRows ?? []).map((r) => r.player_id))];
  if (!playerIds.length) return [];

  const { data: byStats, error: playersError } = await supabase
    .from("players")
    .select("id, name, current_team_id")
    .in("id", playerIds)
    .order("name");
  if (playersError) throw playersError;
  return byStats ?? [];
}

export async function listFbrefPlayerStatsForTeam(
  teamId: string
): Promise<FbrefPlayerStatRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("id, player_id, team_id, stat_type, competition, stats")
    .eq("team_id", teamId);
  if (error) throw error;
  return (data ?? []) as FbrefPlayerStatRow[];
}

export async function listFbrefFinishedMatchesForTeam(
  teamId: string,
  limit = 15
): Promise<FbrefMatchRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, date, time, venue, home_team_id, away_team_id, competition, home_goals, away_goals"
    )
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .not("home_goals", "is", null)
    .not("away_goals", "is", null)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FbrefMatchRow[];
}

export async function listFbrefTeamsByIds(ids: string[]): Promise<FbrefTeamRow[]> {
  if (!ids.length) return [];
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("teams").select("id, name").in("id", ids);
  if (error) throw error;
  return (data ?? []) as FbrefTeamRow[];
}

export async function listFbrefWorldCupMatches(): Promise<FbrefMatchRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, date, time, venue, home_team_id, away_team_id, competition, home_goals, away_goals"
    )
    .ilike("competition", "%World Cup%")
    .order("date");
  if (error) throw error;
  return (data ?? []) as FbrefMatchRow[];
}
