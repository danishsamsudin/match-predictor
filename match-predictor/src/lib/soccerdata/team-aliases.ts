import { normalizeTeamName } from "@/lib/soccerdata/normalize";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

export type TeamAliasSource = "FBref" | "Understat" | "SoFIFA" | "MatchHistory" | "Sofascore";

export async function upsertTeamAliasesFromNameList(input: {
  leagueId: number;
  source: TeamAliasSource;
  soccerdataTeamNames: string[];
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const { data: teams, error } = await supabase
    .from("synced_teams")
    .select("team_id, team_name")
    .eq("league_id", input.leagueId);
  if (error) throw new UpstreamApiError(error.message);

  const byNorm = new Map<string, Array<{ teamId: number; teamName: string }>>();
  for (const row of teams ?? []) {
    const norm = normalizeTeamName(row.team_name);
    const list = byNorm.get(norm) ?? [];
    list.push({ teamId: row.team_id, teamName: row.team_name });
    byNorm.set(norm, list);
  }

  const upserts: Array<{
    league_id: number;
    team_id: number;
    source: string;
    soccerdata_team_name: string;
    normalized_team_name: string;
    confidence: number;
    notes: string | null;
    updated_at: string;
  }> = [];

  for (const rawName of input.soccerdataTeamNames) {
    const norm = normalizeTeamName(rawName);
    const matches = byNorm.get(norm);
    if (!matches || matches.length !== 1) continue;
    const match = matches[0];
    upserts.push({
      league_id: input.leagueId,
      team_id: match.teamId,
      source: input.source,
      soccerdata_team_name: rawName,
      normalized_team_name: norm,
      confidence: 0.95,
      notes: null,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length === 0) {
    return { inserted: 0, message: "No unambiguous aliases found." };
  }

  const { error: upsertErr } = await supabase.from("soccerdata_team_aliases").upsert(upserts, {
    onConflict: "league_id,team_id,source",
  });
  if (upsertErr) throw new UpstreamApiError(upsertErr.message);

  return { inserted: upserts.length };
}

export async function resolveCanonicalTeamId(input: {
  leagueId: number;
  source: TeamAliasSource;
  soccerdataTeamName: string;
}): Promise<number | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const norm = normalizeTeamName(input.soccerdataTeamName);
  const { data } = await supabase
    .from("soccerdata_team_aliases")
    .select("team_id")
    .eq("league_id", input.leagueId)
    .eq("source", input.source)
    .eq("normalized_team_name", norm)
    .order("confidence", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.team_id ?? null;
}

