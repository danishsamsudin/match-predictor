import fs from "fs";
import path from "path";
import {
  mergeSofifaListedPlayers,
  parseSofifaPlayersListHtml,
  type SofifaListedPlayer,
} from "@/lib/data/parse-sofifa-players-list-html";
import {
  findNationsLeagueTeamByName,
  NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
} from "@/lib/data/nations-league-2026-teams";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NL_SOFIFA_PLAYERS_DIR = path.join(
  process.cwd(),
  "data/nations-league-2026/nl-scoutlyst-rankings"
);

const SOFIFA_SOURCE = "SoFIFA";
const BATCH = 40;
const CONCURRENCY = 8;

type ServiceClient = SupabaseClient<Database>;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export function listNlSofifaPlayersHtmlFiles(dir = NL_SOFIFA_PLAYERS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .map((name) => path.join(dir, name))
    .sort((a, b) => a.localeCompare(b));
}

export function loadNlSofifaPlayersFromDir(
  dir = NL_SOFIFA_PLAYERS_DIR
): SofifaListedPlayer[] {
  const files = listNlSofifaPlayersHtmlFiles(dir);
  const batches = files.map((file) =>
    parseSofifaPlayersListHtml(fs.readFileSync(file, "utf8"))
  );
  return mergeSofifaListedPlayers(batches);
}

function resolveNlTeamId(nationality: string | null): number | null {
  if (!nationality?.trim()) return null;
  return findNationsLeagueTeamByName(nationality)?.id ?? null;
}

async function loadExistingSofifaLinks(
  supabase: ServiceClient
): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("soccerdata_player_links")
      .select("player_id, soccerdata_player_key")
      .eq("source", SOFIFA_SOURCE)
      .range(from, from + 999);
    if (error) throw new Error(`soccerdata_player_links: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      byKey.set(String(row.soccerdata_player_key), Number(row.player_id));
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  return byKey;
}

export type NlSofifaImportResult = {
  files: number;
  parsedPlayers: number;
  inserted: number;
  updated: number;
  skippedNoOverall: number;
};

/**
 * Upsert SoFIFA listing-page players into soccerdata_players (+ SoFIFA links).
 * Matches existing rows by Sofifa player id via soccerdata_player_links.
 */
export async function importNlSofifaPlayersFromDir(
  supabase: ServiceClient,
  dir = NL_SOFIFA_PLAYERS_DIR
): Promise<NlSofifaImportResult> {
  const files = listNlSofifaPlayersHtmlFiles(dir);
  const players = loadNlSofifaPlayersFromDir(dir);
  const existing = await loadExistingSofifaLinks(supabase);
  const now = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let skippedNoOverall = 0;

  const actionable = players.filter((player) => {
    if (player.overall == null) {
      skippedNoOverall += 1;
      return false;
    }
    return true;
  });

  for (let i = 0; i < actionable.length; i += BATCH) {
    const chunk = actionable.slice(i, i + BATCH);
    const outcomes = await mapPool(chunk, CONCURRENCY, async (player) => {
      const key = String(player.sofifaPlayerId);
      const teamId = resolveNlTeamId(player.nationality);
      const position = player.positions[0] ?? null;
      const existingId = existing.get(key);

      if (existingId != null) {
        const { error } = await supabase
          .from("soccerdata_players")
          .update({
            name: player.fullName,
            country: player.nationality,
            position,
            sofifa_overall: player.overall,
            sofifa_potential: player.potential,
            ...(teamId != null ? { team_id: teamId } : {}),
            league_id: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
            updated_at: now,
          })
          .eq("id", existingId);
        if (error) {
          console.warn(`update ${player.fullName} (#${key}): ${error.message}`);
          return "skip" as const;
        }
        return "updated" as const;
      }

      const { data: insertedRow, error } = await supabase
        .from("soccerdata_players")
        .insert({
          name: player.fullName,
          league_id: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
          team_id: teamId,
          position,
          country: player.nationality,
          sofifa_overall: player.overall,
          sofifa_potential: player.potential,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (error || !insertedRow) {
        console.warn(`insert ${player.fullName} (#${key}): ${error?.message}`);
        return "skip" as const;
      }

      const { error: linkErr } = await supabase.from("soccerdata_player_links").upsert(
        {
          player_id: insertedRow.id,
          source: SOFIFA_SOURCE,
          soccerdata_player_key: key,
          confidence: 0.95,
          notes: "nl-sofifa-players-list",
          created_at: now,
          updated_at: now,
        },
        { onConflict: "player_id,source" }
      );
      if (linkErr) {
        console.warn(`link ${player.fullName} (#${key}): ${linkErr.message}`);
        return "skip" as const;
      }
      existing.set(key, insertedRow.id);
      return "inserted" as const;
    });

    for (const outcome of outcomes) {
      if (outcome === "inserted") inserted += 1;
      else if (outcome === "updated") updated += 1;
    }

    if ((i + BATCH) % 400 === 0 || i + BATCH >= actionable.length) {
      console.log(
        `  … ${Math.min(i + BATCH, actionable.length)}/${actionable.length} (ins ${inserted}, upd ${updated})`
      );
    }
  }

  return {
    files: files.length,
    parsedPlayers: players.length,
    inserted,
    updated,
    skippedNoOverall,
  };
}
