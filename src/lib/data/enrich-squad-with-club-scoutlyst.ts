import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";
import { buildPlayerDetailStats } from "@/lib/data/player-stat-display";
import {
  loadScoutlystSnapshotsByNames,
  maxPerformanceInputs,
  resolveScoutlystSnapshot,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import type { Database } from "@/lib/supabase";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

function detailStatHasValue(
  player: SquadPlayer,
  labels: string[]
): boolean {
  return player.detailStats.some(
    (stat) =>
      labels.includes(stat.label) &&
      stat.value != null &&
      stat.value !== "" &&
      stat.value !== "-" &&
      stat.value !== "—"
  );
}

function needsClubEnrichment(player: SquadPlayer): boolean {
  if (player.scoutlystPlayerKey?.startsWith("bulinews:")) return true;
  if (player.performanceScore == null) return true;
  return !detailStatHasValue(player, ["Goals", "Shots", "xG", "SoT"]);
}

function applyScoutlystToPlayer(
  player: SquadPlayer,
  scout: ScoutlystSnapshotRow
): SquadPlayer {
  const detailStats = buildPlayerDetailStats(scout.stats);
  const fromScout = computePlayerPerformanceScore({
    scoutlystRating: scout.rating,
    matchAvgRating: null,
    stats: scout.stats,
    position: player.fieldPosition ?? player.position ?? scout.position,
  });
  const performanceScore = maxPerformanceInputs(
    player.performanceScore,
    fromScout
  );

  return {
    ...player,
    scoutlystPlayerKey: scout.scoutlyst_player_key || player.scoutlystPlayerKey,
    // Keep existing SofaScore / synthetic IDs stable so XI slot matching still works.
    sofascorePlayerId: player.sofascorePlayerId,
    performanceScore,
    detailStats:
      detailStats.some((s) => s.value !== "—" && s.value !== "-")
        ? detailStats
        : player.detailStats,
    age: player.age ?? scout.age,
  };
}

/**
 * Attach club Scoutlyst Gls / Sh / SoT / minutes / rating onto national or
 * BuliNews squad players that lack threat metrics (global name lookup).
 */
export async function enrichSquadPlayersWithClubScoutlyst(
  supabase: ServiceClient | null,
  players: SquadPlayer[]
): Promise<SquadPlayer[]> {
  if (!supabase || !players.length) return players;

  const targets = players.filter(needsClubEnrichment);
  if (!targets.length) return players;

  const byName = await loadScoutlystSnapshotsByNames(
    supabase,
    targets.map((p) => p.name)
  );
  if (!byName.size) return players;

  return players.map((player) => {
    if (!needsClubEnrichment(player)) return player;
    const scout = resolveScoutlystSnapshot(player.name, byName);
    if (!scout) return player;
    return applyScoutlystToPlayer(player, scout);
  });
}

export async function enrichSquadSidesWithClubScoutlyst(
  supabase: ServiceClient | null,
  home: SquadPlayer[],
  away: SquadPlayer[]
): Promise<{ home: SquadPlayer[]; away: SquadPlayer[] }> {
  const [homeEnriched, awayEnriched] = await Promise.all([
    enrichSquadPlayersWithClubScoutlyst(supabase, home),
    enrichSquadPlayersWithClubScoutlyst(supabase, away),
  ]);
  return { home: homeEnriched, away: awayEnriched };
}
