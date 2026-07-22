import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  createSportmonksClient,
  DEFAULT_GLPM_LEAGUE_IDS,
} from "@/lib/sportmonks/client";
import type { SmFixture, SmScore } from "@/lib/sportmonks/types";
import { mapSportmonksEvents } from "@/lib/glpm/layer1/sportmonks/upsertFixture";
import {
  isFinishedFixture,
  SM_FIXTURE_STATE_FINISHED,
} from "@/lib/glpm/sportmonks/fixtureSchedule";
import {
  LIVE_POLL_AFTER_KICKOFF_MS,
  LIVE_POLL_LEAD_MS,
  LIVESCORE_EVENT_TYPE_FILTER,
  PLAN_LIVESCORE_INCLUDE,
  SM_FIXTURE_STATE_LIVE_WINDOW,
} from "./constants";

type Client = SupabaseClient<Database>;

export type LivescoreSyncResult = {
  skipped: boolean;
  reason?: string;
  inWindowCount: number;
  fetchedCount: number;
  updatedCount: number;
  matchSmIds: number[];
  syncedAt: string;
};

function currentGoals(scores: SmScore[] | undefined, participantId: number): number | null {
  if (!scores?.length) return null;
  const preferred = scores.find(
    (s) =>
      s.participant_id === participantId &&
      (s.description === "CURRENT" ||
        s.description === "2ND_HALF" ||
        s.description === "FULLTIME" ||
        s.description === "1ST_HALF")
  );
  const any = preferred ?? scores.find((s) => s.participant_id === participantId);
  const g = any?.score?.goals;
  return typeof g === "number" ? g : null;
}

function homeAwayIds(fixture: SmFixture): { homeId: number; awayId: number } | null {
  const parts = fixture.participants ?? [];
  const home = parts.find((p) => p.meta?.location === "home");
  const away = parts.find((p) => p.meta?.location === "away");
  if (!home || !away) return null;
  return { homeId: home.id, awayId: away.id };
}

function mergeLivePayload(
  previous: unknown,
  fixture: SmFixture
): Record<string, unknown> {
  const prev =
    previous && typeof previous === "object" ? (previous as Record<string, unknown>) : {};
  return {
    ...prev,
    id: fixture.id,
    league_id: fixture.league_id ?? prev.league_id,
    season_id: fixture.season_id ?? prev.season_id,
    state_id: fixture.state_id ?? prev.state_id,
    starting_at: fixture.starting_at ?? prev.starting_at,
    length: fixture.length ?? prev.length,
    name: fixture.name ?? prev.name,
    participants: fixture.participants ?? prev.participants,
    scores: fixture.scores ?? prev.scores,
    state: fixture.state ?? prev.state,
    venue: fixture.venue ?? prev.venue,
    league: fixture.league ?? prev.league,
    round: fixture.round ?? prev.round,
    periods: fixture.periods ?? prev.periods,
    events: fixture.events ?? prev.events,
    statistics: fixture.statistics ?? prev.statistics,
    xGFixture: fixture.xGFixture ?? prev.xGFixture,
  };
}

/**
 * True when our DB already knows a GLPM fixture is inside the livescore poll window.
 * Avoids SportMonks API calls on quiet days / overnight.
 */
export async function countFixturesInLivePollWindow(
  client: Client,
  nowMs = Date.now()
): Promise<number> {
  const windowStart = new Date(nowMs - LIVE_POLL_AFTER_KICKOFF_MS).toISOString();
  const windowEnd = new Date(nowMs + LIVE_POLL_LEAD_MS).toISOString();

  const { data, error } = await client
    .from("glpm_matches")
    .select("sm_id,state_id,status,kickoff_at")
    .gte("kickoff_at", windowStart)
    .lte("kickoff_at", windowEnd)
    .in("league_sm_id", DEFAULT_GLPM_LEAGUE_IDS)
    .limit(200);

  if (error) throw new Error(`Live window query failed: ${error.message}`);

  const rows = data ?? [];
  return rows.filter((row) => {
    if (row.state_id != null && SM_FIXTURE_STATE_FINISHED.has(row.state_id)) return false;
    if (
      isFinishedFixture({
        id: row.sm_id,
        stateId: row.state_id,
        stateName: row.status,
      })
    ) {
      return false;
    }
    if (row.state_id != null && SM_FIXTURE_STATE_LIVE_WINDOW.has(row.state_id)) return true;
    return true;
  }).length;
}

/**
 * Poll SportMonks `/livescores/inplay` for GLPM leagues and patch `glpm_matches`
 * scores + live payload (events, statistics, periods) for the home timeline.
 */
export async function syncInplayLivescores(
  client: Client,
  options?: { force?: boolean; leagueIds?: number[] }
): Promise<LivescoreSyncResult> {
  const syncedAt = new Date().toISOString();
  const leagueIds = options?.leagueIds ?? DEFAULT_GLPM_LEAGUE_IDS;

  const inWindowCount = await countFixturesInLivePollWindow(client);
  if (!options?.force && inWindowCount === 0) {
    return {
      skipped: true,
      reason: "no_fixtures_in_live_window",
      inWindowCount: 0,
      fetchedCount: 0,
      updatedCount: 0,
      matchSmIds: [],
      syncedAt,
    };
  }

  const sm = createSportmonksClient();
  const fixtures = await sm.getInplayLivescores({
    leagueIds,
    include: PLAN_LIVESCORE_INCLUDE,
    extraFilters: LIVESCORE_EVENT_TYPE_FILTER,
  });

  let updatedCount = 0;
  const matchSmIds: number[] = [];

  for (const fixture of fixtures) {
    const sides = homeAwayIds(fixture);
    if (!sides) continue;

    const homeScore = currentGoals(fixture.scores, sides.homeId);
    const awayScore = currentGoals(fixture.scores, sides.awayId);
    const stateId = fixture.state_id ?? fixture.state?.id ?? null;
    const status = fixture.state?.name ?? fixture.state?.short_name ?? null;
    const venue = fixture.venue?.name ?? null;
    const roundName = fixture.round?.name;
    const gameweek =
      roundName != null && /^\d+$/.test(String(roundName).trim())
        ? Number(roundName)
        : null;

    const { data: existing, error: readErr } = await client
      .from("glpm_matches")
      .select("payload")
      .eq("sm_id", fixture.id)
      .maybeSingle();

    if (readErr) {
      console.warn(`[livescores] read fixture ${fixture.id} failed: ${readErr.message}`);
      continue;
    }

    const patch: Database["public"]["Tables"]["glpm_matches"]["Update"] = {
      home_score: homeScore,
      away_score: awayScore,
      state_id: stateId,
      status,
      synced_at: syncedAt,
      payload: mergeLivePayload(existing?.payload, fixture),
    };
    if (venue) patch.venue = venue;
    if (gameweek != null) patch.gameweek = gameweek;
    if (fixture.length != null) patch.duration_minutes = fixture.length;

    const { error, count } = await client
      .from("glpm_matches")
      .update(patch, { count: "exact" })
      .eq("sm_id", fixture.id);

    if (error) {
      console.warn(`[livescores] update fixture ${fixture.id} failed: ${error.message}`);
      continue;
    }

    const events = mapSportmonksEvents(fixture);
    if (events.length) {
      const { error: evErr } = await client
        .from("glpm_match_events")
        .upsert(events, { onConflict: "event_id" });
      if (evErr) {
        console.warn(`[livescores] upsert events ${fixture.id} failed: ${evErr.message}`);
      }
    }

    matchSmIds.push(fixture.id);
    if ((count ?? 0) > 0) updatedCount += 1;
  }

  return {
    skipped: false,
    inWindowCount,
    fetchedCount: fixtures.length,
    updatedCount,
    matchSmIds,
    syncedAt,
  };
}
