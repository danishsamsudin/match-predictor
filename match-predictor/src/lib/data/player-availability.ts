import { normalizeText } from "@/lib/soccerdata/normalize";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type PlayerAvailabilityStatus = "injured" | "suspended" | "doubtful";

const BLOCKING_STATUSES = new Set<PlayerAvailabilityStatus>(["injured", "suspended"]);

export function isBlockingAvailabilityStatus(
  status: string | null | undefined
): status is PlayerAvailabilityStatus {
  return status != null && BLOCKING_STATUSES.has(status as PlayerAvailabilityStatus);
}

export async function loadBlockingAvailabilityNameKeys(
  supabase: ServiceClient | null
): Promise<Set<string>> {
  if (!supabase) return new Set();

  const { data, error } = await supabase
    .from("player_availabilities")
    .select("player_name, status")
    .in("status", ["injured", "suspended"]);

  if (error || !data?.length) return new Set();

  const keys = new Set<string>();
  for (const row of data) {
    if (!isBlockingAvailabilityStatus(row.status)) continue;
    const display = formatPlayerDisplayNameIfNeeded(row.player_name);
    keys.add(normalizeText(display));
    for (const key of playerNameLookupKeys(display)) {
      keys.add(key);
    }
  }
  return keys;
}

export function isPlayerBlockedByAvailability(
  playerName: string,
  blockingKeys: Set<string>
): boolean {
  if (!blockingKeys.size) return false;
  const display = formatPlayerDisplayNameIfNeeded(playerName);
  if (blockingKeys.has(normalizeText(display))) return true;
  return playerNameLookupKeys(display).some((key) => blockingKeys.has(key));
}

export function filterPlayersByAvailability<
  T extends { name: string; sofascorePlayerId?: number },
>(players: T[], blockingKeys: Set<string>): T[] {
  if (!blockingKeys.size) return players;
  return players.filter((p) => !isPlayerBlockedByAvailability(p.name, blockingKeys));
}
