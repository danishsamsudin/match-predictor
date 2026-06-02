import { fetchSoccerdata } from "@/lib/api/soccerdata/service";
import type { SoccerdataDataFrame } from "@/lib/api/soccerdata/types";
import { soccerdataLeagueIdForReference } from "@/lib/config/soccerdata-leagues";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

function asDataFrame(data: unknown): SoccerdataDataFrame {
  const d = data as SoccerdataDataFrame;
  if (!d || d.kind !== "dataframe") throw new UpstreamApiError("Expected dataframe from SoccerData.");
  return d;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Ingest a SoFIFA player catalog into `soccerdata_players` + `soccerdata_player_links`.
 * This does NOT attempt to map players to SofaScore ids yet; it creates a platform-local catalog.
 */
export async function importPlayersFromSofifa(input: {
  referenceLeagueId: number;
  version?: string | number;
}): Promise<{ playersUpserted: number }> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const league = soccerdataLeagueIdForReference("MatchHistory", input.referenceLeagueId);
  // SoFIFA league ids are usually aligned with FBref style; we reuse the mapping table for now.
  const leagueId = league ?? undefined;

  const playersRes = await fetchSoccerdata({
    source: "SoFIFA",
    method: "read_players",
    constructor: {
      leagues: leagueId ? [leagueId] : undefined,
      versions: input.version ?? "latest",
    },
    persist: true,
  });

  const df = asDataFrame(playersRes.data);

  const ratingsRes = await fetchSoccerdata({
    source: "SoFIFA",
    method: "read_player_ratings",
    constructor: {
      leagues: leagueId ? [leagueId] : undefined,
      versions: input.version ?? "latest",
    },
    persist: true,
  });
  const ratingsDf = asDataFrame(ratingsRes.data);
  const overallByKey = new Map<string, number>();
  for (const row of ratingsDf.records) {
    const key =
      pickString(row, ["player_id", "id", "sofifa_id"]) ??
      pickString(row, ["url", "player_url"]) ??
      pickString(row, ["name", "player"]) ??
      "";
    if (!key) continue;
    const overall = Number((row.overall ?? row.ovr ?? row.rating) as unknown);
    if (Number.isFinite(overall)) overallByKey.set(key, overall);
  }

  const now = new Date().toISOString();

  let upserted = 0;
  for (const row of df.records) {
    const name = pickString(row, ["player", "name", "player_name", "short_name"]) ?? "";
    const sourceKey =
      pickString(row, ["player_id", "id", "sofifa_id"]) ??
      pickString(row, ["url", "player_url"]) ??
      name;
    if (!name || !sourceKey) continue;
    const overall = overallByKey.get(sourceKey) ?? null;

    const { data: inserted, error } = await supabase
      .from("soccerdata_players")
      .insert({
        name,
        league_id: input.referenceLeagueId,
        team_id: null,
        position: pickString(row, ["position", "pos"]),
        country: pickString(row, ["nation", "country"]),
        sofifa_overall: overall,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) {
      // If insert fails due to duplicates (we don't have a unique constraint yet), skip.
      continue;
    }

    const { error: linkErr } = await supabase.from("soccerdata_player_links").upsert(
      {
        player_id: inserted.id,
        source: "SoFIFA",
        soccerdata_player_key: sourceKey,
        confidence: 0.8,
        notes: null,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "player_id,source" }
    );
    if (linkErr) continue;
    upserted += 1;
  }

  return { playersUpserted: upserted };
}

