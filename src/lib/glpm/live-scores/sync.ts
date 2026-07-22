import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  createSportmonksClient,
  DEFAULT_GLPM_LEAGUE_IDS,
} from "@/lib/sportmonks/client";
import type { SmFixture, SmScore } from "@/lib/sportmonks/types";
import {
  isFinishedFixture,
  SM_FIXTURE_STATE_FINISHED,
} from "@/lib/glpm/sportmonks/fixtureSchedule";
import {
  LIVE_POLL_AFTER_KICKOFF_MS,
  LIVE_POLL_LEAD_MS,
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
    // Kickoff inside window and not finished → poll (covers missing state_id).
    return true;
  }).length;
}

/**
 * Poll SportMonks `/livescores/inplay` for GLPM leagues and patch `glpm_matches` scores.
 * Early-exits without an API call when no fixtures are in the local poll window.
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

    const patch: Database["public"]["Tables"]["glpm_matches"]["Update"] = {
      home_score: homeScore,
      away_score: awayScore,
      state_id: stateId,
      status,
      synced_at: syncedAt,
    };
    if (venue) patch.venue = venue;
    if (gameweek != null) patch.gameweek = gameweek;

    const { error, count } = await client
      .from("glpm_matches")
      .update(patch, { count: "exact" })
      .eq("sm_id", fixture.id);

    if (error) {
      console.warn(`[livescores] update fixture ${fixture.id} failed: ${error.message}`);
      continue;
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
