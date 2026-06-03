import {
  buildSofaScorePlayerIndex,
  buildTeamNameToIdMap,
  resolveSofaScorePlayerId,
} from "@/lib/scoutlyst/link-sofascore-players";
import {
  mapScoutlystExportRow,
  resolveSnapshotDateFromExport,
} from "@/lib/scoutlyst/map-scoutlyst-export-row";
import { parseScoutlystExport } from "@/lib/scoutlyst/parse-scoutlyst-export";
import { mapScoutlystRow, resolveSnapshotDate } from "@/lib/scoutlyst/map-row";
import { parseCsv } from "@/lib/scoutlyst/parse-csv";
import { normalizeTeamName } from "@/lib/soccerdata/normalize";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

const UPSERT_CHUNK = 200;

export type ScoutlystImportResult = {
  ok: boolean;
  batchId: number;
  snapshotDate: string;
  fileName: string;
  rowsImported: number;
  rowsLinked: number;
  rowsSkipped: number;
  columnCount?: number;
};

export async function importScoutlystCsv(input: {
  csvText: string;
  fileName: string;
  snapshotDate?: string;
  referenceLeagueId?: number;
  linkSofascore?: boolean;
}): Promise<ScoutlystImportResult> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const scoutlystParsed = parseScoutlystExport(input.csvText);
  const useScoutlystFormat = scoutlystParsed.rows.length > 0 && scoutlystParsed.columnKeys.length > 0;

  const snapshotDate = useScoutlystFormat
    ? resolveSnapshotDateFromExport(scoutlystParsed, input.fileName, input.snapshotDate)
    : resolveSnapshotDate(input.snapshotDate, input.fileName);

  if (!useScoutlystFormat) {
    const { headers, rows } = parseCsv(input.csvText);
    if (!headers.length) {
      throw new UpstreamApiError("CSV has no recognizable Scoutlyst header row.");
    }
    scoutlystParsed.columnKeys = headers;
    scoutlystParsed.rows = rows;
  }

  const { data: batchRow, error: batchErr } = await supabase
    .from("scoutlyst_import_batches")
    .insert({
      file_name: input.fileName,
      snapshot_date: snapshotDate,
      status: "running",
    })
    .select("id")
    .single();

  if (batchErr || !batchRow) {
    throw new UpstreamApiError(batchErr?.message ?? "Failed to create import batch.");
  }

  const batchId = batchRow.id;
  const linkSofascore = input.linkSofascore !== false;
  const teamByName = await buildTeamNameToIdMap(supabase);
  const playerIndex = linkSofascore ? await buildSofaScorePlayerIndex(supabase) : new Map();

  let rowsImported = 0;
  let rowsLinked = 0;
  let rowsSkipped = 0;
  const now = new Date().toISOString();

  const upsertPayloads: Array<{
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
    stats: Record<string, string | number | null>;
    import_batch_id: number;
    imported_at: string;
  }> = [];

  const linkUpserts: Array<{
    scoutlyst_player_key: string;
    player_name: string;
    reference_team_id: number | null;
    sofascore_player_id: number | null;
    confidence: number;
    linked_at: string | null;
    updated_at: string;
  }> = [];

  for (const raw of scoutlystParsed.rows) {
    const mapped = useScoutlystFormat
      ? mapScoutlystExportRow(raw, scoutlystParsed.columnKeys, input.referenceLeagueId)
      : mapScoutlystRow(raw, scoutlystParsed.columnKeys);

    if (!mapped) {
      rowsSkipped += 1;
      continue;
    }

    const referenceTeamId =
      mapped.team_name != null ? (teamByName.get(normalizeTeamName(mapped.team_name)) ?? null) : null;

    const { sofascorePlayerId, confidence } = linkSofascore
      ? resolveSofaScorePlayerId({
          playerName: mapped.player_name,
          teamName: mapped.team_name,
          referenceTeamId,
          playerIndex,
        })
      : { sofascorePlayerId: null, confidence: 0 };

    if (sofascorePlayerId != null) rowsLinked += 1;

    upsertPayloads.push({
      scoutlyst_player_key: mapped.scoutlyst_player_key,
      snapshot_date: snapshotDate,
      player_name: mapped.player_name,
      team_name: mapped.team_name,
      league_name: mapped.league_name,
      reference_league_id: input.referenceLeagueId ?? null,
      reference_team_id: referenceTeamId,
      sofascore_player_id: sofascorePlayerId,
      position: mapped.position,
      age: mapped.age,
      rating: mapped.rating,
      stats: mapped.stats,
      import_batch_id: batchId,
      imported_at: now,
    });

    if (sofascorePlayerId != null) {
      linkUpserts.push({
        scoutlyst_player_key: mapped.scoutlyst_player_key,
        player_name: mapped.player_name,
        reference_team_id: referenceTeamId,
        sofascore_player_id: sofascorePlayerId,
        confidence,
        linked_at: now,
        updated_at: now,
      });
    }
  }

  for (let i = 0; i < upsertPayloads.length; i += UPSERT_CHUNK) {
    const chunk = upsertPayloads.slice(i, i + UPSERT_CHUNK);
    const playerKeys = [...new Set(chunk.map((row) => row.scoutlyst_player_key))];
    const { data: existingRows } = await supabase
      .from("scoutlyst_player_snapshots")
      .select("scoutlyst_player_key, stats")
      .eq("snapshot_date", snapshotDate)
      .in("scoutlyst_player_key", playerKeys);

    const existingStatsByKey = new Map<string, Record<string, string | number | null>>();
    for (const row of existingRows ?? []) {
      const stats =
        row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
          ? (row.stats as Record<string, string | number | null>)
          : {};
      existingStatsByKey.set(row.scoutlyst_player_key, stats);
    }

    for (const row of chunk) {
      const previous = existingStatsByKey.get(row.scoutlyst_player_key);
      if (previous) {
        row.stats = { ...previous, ...row.stats };
      }
    }

    const { error } = await supabase
      .from("scoutlyst_player_snapshots")
      .upsert(chunk, { onConflict: "scoutlyst_player_key,snapshot_date" });
    if (error) {
      await supabase
        .from("scoutlyst_import_batches")
        .update({ status: "failed", error_message: error.message })
        .eq("id", batchId);
      throw new UpstreamApiError(error.message);
    }
    rowsImported += chunk.length;
  }

  for (let i = 0; i < linkUpserts.length; i += UPSERT_CHUNK) {
    const chunk = linkUpserts.slice(i, i + UPSERT_CHUNK);
    await supabase.from("scoutlyst_player_links").upsert(chunk, {
      onConflict: "scoutlyst_player_key",
    });
  }

  await supabase
    .from("scoutlyst_import_batches")
    .update({
      status: "completed",
      rows_imported: rowsImported,
      rows_linked: rowsLinked,
    })
    .eq("id", batchId);

  return {
    ok: true,
    batchId,
    snapshotDate,
    fileName: input.fileName,
    rowsImported,
    rowsLinked,
    rowsSkipped,
    columnCount: scoutlystParsed.columnKeys.length,
  };
}
