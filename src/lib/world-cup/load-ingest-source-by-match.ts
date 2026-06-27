import type { SupabaseClient } from "@supabase/supabase-js";

export type IngestSourceMeta = {
  ingest_source_home: string | null;
  ingest_source_away: string | null;
  ingest_source_home_goals: number | null;
  ingest_source_away_goals: number | null;
};

const EMPTY: IngestSourceMeta = {
  ingest_source_home: null,
  ingest_source_away: null,
  ingest_source_home_goals: null,
  ingest_source_away_goals: null,
};

function parseIngestTeamNames(parsed: unknown): IngestSourceMeta {
  if (!parsed || typeof parsed !== "object") return EMPTY;
  const p = parsed as Record<string, unknown>;
  return {
    ingest_source_home: typeof p.homeTeamName === "string" ? p.homeTeamName : null,
    ingest_source_away: typeof p.awayTeamName === "string" ? p.awayTeamName : null,
    ingest_source_home_goals: typeof p.homeGoals === "number" ? p.homeGoals : null,
    ingest_source_away_goals: typeof p.awayGoals === "number" ? p.awayGoals : null,
  };
}

/** Latest ingest home/away labels from `world_cup_post_match_ingests` (not on `matches`). */
export async function loadIngestSourceByMatchId(
  supabase: SupabaseClient,
  matchIds: string[]
): Promise<Map<string, IngestSourceMeta>> {
  const out = new Map<string, IngestSourceMeta>();
  if (matchIds.length === 0) return out;

  const { data, error } = await supabase
    .from("world_cup_post_match_ingests")
    .select("match_id, parsed, ingested_at")
    .in("match_id", matchIds);

  if (error) throw new Error(error.message);

  const latest = new Map<string, { at: string; meta: IngestSourceMeta }>();
  for (const row of data ?? []) {
    const matchId = String(row.match_id);
    const ingestedAt = String(row.ingested_at ?? "");
    const meta = parseIngestTeamNames(row.parsed);
    const existing = latest.get(matchId);
    if (!existing || ingestedAt > existing.at) {
      latest.set(matchId, { at: ingestedAt, meta });
    }
  }

  for (const [id, { meta }] of latest) {
    out.set(id, meta);
  }
  return out;
}

export function ingestSourceForMatch(
  map: Map<string, IngestSourceMeta>,
  matchId: string
): IngestSourceMeta {
  return map.get(matchId) ?? EMPTY;
}
