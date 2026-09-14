/**
 * Lightweight kickoff/date refresh for the next week of GLPM fixtures.
 *
 * Full schedule ingest only runs weekly, and morning sync only loads yesterday +
 * today, so TV-time moves (Sunday lunch -> Monday evening) stayed stale on home.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import { tryCreateServiceClient } from "../../supabase";
import {
  createSportmonksClient,
  DEFAULT_GLPM_LEAGUE_IDS,
  type SportmonksClient,
} from "../../sportmonks/client";
import type { SmFixture } from "../../sportmonks/types";
import {
  addCalendarDays,
  formatDateInTimeZone,
  resolveMatchdayTimeZone,
  resolveSportmonksKickoff,
} from "./matchday";
import { ingestFixturePayloads } from "./ingestFixturesBatch";

type Client = SupabaseClient<Database>;

/** Enough for cards + kickoff; avoids overwriting stats-heavy payloads on known matches. */
const KICKOFF_INCLUDE = "participants;state;venue;season;league;round;scores";

export type RefreshUpcomingTimesOptions = {
  timeZone?: string;
  /** Inclusive start YYYY-MM-DD (SportMonks calendar). */
  startYmd?: string;
  /** Inclusive end YYYY-MM-DD. */
  endYmd?: string;
  leagueIds?: number[];
  dryRun?: boolean;
  client?: SportmonksClient;
  supabase?: Client;
};

export type RefreshUpcomingTimesSummary = {
  startYmd: string;
  endYmd: string;
  fetched: number;
  updated: number;
  unchanged: number;
  ingested: number;
  failed: number;
  errors: string[];
};

function requireSupabase(existing?: Client): Client {
  const sb = existing ?? tryCreateServiceClient();
  if (!sb) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return sb;
}

function statusFromFixture(fixture: SmFixture): string | null {
  return fixture.state?.name ?? fixture.state?.short_name ?? null;
}

function stateIdFromFixture(fixture: SmFixture): number | null {
  return fixture.state_id ?? fixture.state?.id ?? null;
}

function kickoffKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : iso;
}

export async function refreshUpcomingFixtureTimes(
  options: RefreshUpcomingTimesOptions = {}
): Promise<RefreshUpcomingTimesSummary> {
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const startYmd =
    options.startYmd ?? formatDateInTimeZone(new Date(), timeZone);
  const endYmd = options.endYmd ?? addCalendarDays(startYmd, 8);
  const leagueIds = options.leagueIds ?? DEFAULT_GLPM_LEAGUE_IDS;
  const dryRun = Boolean(options.dryRun);
  const sm = options.client ?? createSportmonksClient();
  const supabase = requireSupabase(options.supabase);

  const fixtures = await sm.getFixturesBetween(startYmd, endYmd, {
    leagueIds,
    include: KICKOFF_INCLUDE,
  });
  const unique = new Map<number, SmFixture>();
  for (const f of fixtures) unique.set(f.id, f);
  const list = [...unique.values()];

  const summary: RefreshUpcomingTimesSummary = {
    startYmd,
    endYmd,
    fetched: list.length,
    updated: 0,
    unchanged: 0,
    ingested: 0,
    failed: 0,
    errors: [],
  };

  if (!list.length) return summary;

  const ids = list.map((f) => f.id);
  const { data: existingRows, error: existingErr } = await supabase
    .from("glpm_matches")
    .select("sm_id,match_date,kickoff_at,status,state_id")
    .in("sm_id", ids);
  if (existingErr) throw new Error(`load matches for kickoff refresh failed: ${existingErr.message}`);

  const existing = new Map((existingRows ?? []).map((row) => [row.sm_id, row]));
  const missing: SmFixture[] = [];
  const nowIso = new Date().toISOString();

  for (const fixture of list) {
    const kick = resolveSportmonksKickoff(fixture);
    const prev = existing.get(fixture.id);
    if (!prev) {
      missing.push(fixture);
      continue;
    }

    const nextStatus = statusFromFixture(fixture);
    const nextStateId = stateIdFromFixture(fixture);
    const kickoffChanged = kickoffKey(prev.kickoff_at) !== kickoffKey(kick.kickoffAt);
    const dateChanged = (prev.match_date ?? null) !== (kick.matchDate ?? null);
    const statusChanged = nextStatus != null && nextStatus !== prev.status;
    const stateChanged = nextStateId != null && nextStateId !== prev.state_id;
    if (!kickoffChanged && !dateChanged && !statusChanged && !stateChanged) {
      summary.unchanged += 1;
      continue;
    }

    if (dryRun) {
      summary.updated += 1;
      continue;
    }

    const { error } = await supabase
      .from("glpm_matches")
      .update({
        match_date: kick.matchDate,
        kickoff_at: kick.kickoffAt,
        ...(nextStatus != null ? { status: nextStatus } : {}),
        ...(nextStateId != null ? { state_id: nextStateId } : {}),
        synced_at: nowIso,
      })
      .eq("sm_id", fixture.id);
    if (error) {
      summary.failed += 1;
      summary.errors.push(`fixture ${fixture.id}: ${error.message}`);
      continue;
    }
    summary.updated += 1;
  }

  if (missing.length) {
    const ingest = await ingestFixturePayloads(supabase, missing, {
      buildFeatures: false,
      dryRun,
    });
    summary.ingested = ingest.ok + ingest.flagged;
    summary.failed += ingest.failed;
    summary.errors.push(...ingest.errors);
  }

  return summary;
}
