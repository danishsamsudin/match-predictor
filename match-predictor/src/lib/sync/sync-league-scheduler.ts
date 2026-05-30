import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueOption } from "@/lib/types/football-lookup";
import type { Database } from "@/lib/supabase";
import {
  getAllLeagues,
  getLeagueById,
  getLeaguesBySyncTier,
} from "@/lib/data/football-reference";

export interface SyncLeagueSchedule {
  referenceLeagueId: number;
  syncTeams: boolean;
  syncFixtures: boolean;
}

const TIER2_PER_RUN = 4;
const TIER3_PER_RUN = 2;

function isDue(nextSyncAfter: string | null | undefined, now: Date): boolean {
  if (!nextSyncAfter) return true;
  return new Date(nextSyncAfter) <= now;
}

function daysUntilNextSync(tier: 1 | 2 | 3): number {
  if (tier === 1) return 1;
  if (tier === 2) return 2;
  return 7;
}

export async function selectLeaguesForSync(
  supabase: SupabaseClient<Database>,
  options?: { force?: boolean }
): Promise<SyncLeagueSchedule[]> {
  const now = new Date();
  const allLeagues = getAllLeagues();
  const { data: states } = await supabase.from("sync_league_state").select("*");

  const stateByLeague = new Map(
    (states ?? []).map((s) => [s.reference_league_id, s])
  );

  const schedule: SyncLeagueSchedule[] = [];

  for (const league of getLeaguesBySyncTier(1)) {
    const state = stateByLeague.get(league.id);
    if (options?.force || isDue(state?.next_sync_after, now)) {
      schedule.push({
        referenceLeagueId: league.id,
        syncTeams: true,
        syncFixtures: true,
      });
    }
  }

  const tier2Due = allLeagues
    .filter((l) => l.syncTier === 2)
    .filter((l) => {
      const state = stateByLeague.get(l.id);
      return options?.force || isDue(state?.next_sync_after, now);
    })
    .slice(0, TIER2_PER_RUN);

  for (const league of tier2Due) {
    schedule.push({
      referenceLeagueId: league.id,
      syncTeams: true,
      syncFixtures: true,
    });
  }

  const tier3Due = allLeagues
    .filter((l) => l.syncTier === 3)
    .filter((l) => {
      const state = stateByLeague.get(l.id);
      return options?.force || isDue(state?.next_sync_after, now);
    })
    .slice(0, TIER3_PER_RUN);

  for (const league of tier3Due) {
    schedule.push({
      referenceLeagueId: league.id,
      syncTeams: true,
      syncFixtures: league.entityType === "club",
    });
  }

  return schedule;
}

export async function markLeagueSynced(
  supabase: SupabaseClient<Database>,
  referenceLeagueId: number,
  synced: { teams?: boolean; fixtures?: boolean }
): Promise<void> {
  const league = getLeagueById(referenceLeagueId);
  if (!league) return;

  const now = new Date();
  const nextSync = new Date(now);
  nextSync.setDate(nextSync.getDate() + daysUntilNextSync(league.syncTier));

  const { data: existing } = await supabase
    .from("sync_league_state")
    .select("*")
    .eq("reference_league_id", referenceLeagueId)
    .maybeSingle();

  await supabase.from("sync_league_state").upsert({
    reference_league_id: referenceLeagueId,
    last_teams_sync_at: synced.teams ? now.toISOString() : existing?.last_teams_sync_at ?? null,
    last_fixtures_sync_at: synced.fixtures
      ? now.toISOString()
      : existing?.last_fixtures_sync_at ?? null,
    next_sync_after: nextSync.toISOString(),
  });
}

export function getLeagueSyncTier(referenceLeagueId: number): LeagueOption["syncTier"] {
  return getLeagueById(referenceLeagueId)?.syncTier ?? 2;
}
