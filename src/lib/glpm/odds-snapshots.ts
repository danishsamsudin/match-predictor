/**
 * Persist Odds API book prices into glpm_odds_snapshots for CLV / sharp shrink.
 */

import { tryCreateServiceClient } from "@/lib/supabase";
import type { OddsApiEvent } from "@/lib/odds-api/types";
import { mapEventToValueRows } from "@/lib/odds-api/select-best";
import { ODDS_SPORT_BY_LEAGUE_SM_ID } from "@/lib/odds-api/config";

export type OddsSnapshotInsert = {
  match_sm_id: number | null;
  league_sm_id: number;
  sport_key: string;
  odds_event_id: string | null;
  home_team: string | null;
  away_team: string | null;
  commence_time: string | null;
  captured_at: string;
  book: string;
  market_key: string;
  selection: string;
  line: number | null;
  decimal_odds: number;
  implied_prob: number | null;
  fair_prob: number | null;
  source: string;
};

function leagueSmIdForSport(sportKey: string): number | null {
  for (const [id, key] of Object.entries(ODDS_SPORT_BY_LEAGUE_SM_ID)) {
    if (key === sportKey) return Number(id);
  }
  return null;
}

function parseLineFromRowId(rowId: string): number | null {
  const m = rowId.match(/(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Build snapshot rows from a warmed Odds API event (featured + extras if present). */
export function snapshotsFromOddsEvent(input: {
  event: OddsApiEvent;
  sportKey: string;
  leagueSmId?: number | null;
  matchSmId?: number | null;
  capturedAt?: string;
}): OddsSnapshotInsert[] {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const leagueSmId =
    input.leagueSmId ?? leagueSmIdForSport(input.sportKey) ?? 0;
  const selected = mapEventToValueRows(input.event);
  const out: OddsSnapshotInsert[] = [];

  for (const row of selected) {
    const line = parseLineFromRowId(row.rowId);
    const books: Array<{ book: string; price: number | null }> = [
      { book: "pinnacle", price: row.pinnaclePrice },
      { book: "unibet_nl", price: row.unibetPrice },
      { book: row.source, price: row.price },
    ];
    const seen = new Set<string>();
    for (const b of books) {
      if (b.price == null || !(b.price > 1)) continue;
      const key = `${b.book}|${row.rowId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const implied = 1 / b.price;
      out.push({
        match_sm_id: input.matchSmId ?? null,
        league_sm_id: leagueSmId,
        sport_key: input.sportKey,
        odds_event_id: input.event.id ?? null,
        home_team: input.event.home_team ?? null,
        away_team: input.event.away_team ?? null,
        commence_time: input.event.commence_time ?? null,
        captured_at: capturedAt,
        book: b.book,
        market_key: row.rowId.split("-")[0] ?? row.rowId,
        selection: row.rowId,
        line,
        decimal_odds: b.price,
        implied_prob: implied,
        fair_prob: null,
        source: "odds_api",
      });
    }
  }
  return out;
}

export async function persistOddsSnapshots(
  rows: OddsSnapshotInsert[]
): Promise<{ inserted: number; error?: string }> {
  if (!rows.length) return { inserted: 0 };
  const supabase = tryCreateServiceClient();
  if (!supabase) return { inserted: 0, error: "no supabase" };

  // Deduplicate within batch on unique key fields (timestamp may collide → jitter)
  const unique = new Map<string, OddsSnapshotInsert>();
  for (const row of rows) {
    const k = [
      row.sport_key,
      row.odds_event_id ?? "",
      row.book,
      row.market_key,
      row.selection,
      row.captured_at,
    ].join("|");
    unique.set(k, row);
  }
  const batch = [...unique.values()];
  const { error } = await supabase.from("glpm_odds_snapshots").upsert(batch as never, {
    onConflict: "sport_key,odds_event_id,book,market_key,selection,captured_at",
    ignoreDuplicates: true,
  });
  if (error) return { inserted: 0, error: error.message };
  return { inserted: batch.length };
}

/**
 * Archive all events from a warmed league cache payload.
 */
export async function archiveLeagueOddsEvents(input: {
  sportKey: string;
  events: OddsApiEvent[];
  leagueSmId?: number | null;
}): Promise<{ inserted: number; error?: string }> {
  const capturedAt = new Date().toISOString();
  const rows: OddsSnapshotInsert[] = [];
  for (const event of input.events) {
    rows.push(
      ...snapshotsFromOddsEvent({
        event,
        sportKey: input.sportKey,
        leagueSmId: input.leagueSmId,
        capturedAt,
      })
    );
  }
  return persistOddsSnapshots(rows);
}
