import {
  LAV_BASELINE_SCORE,
  ratingToPerformanceScore,
  resolvePlayerPerformanceScore,
} from "@/lib/prediction/lineup-impact";
import type { FixtureLineup } from "@/lib/types/football";
import type { SyncedPlayerRatingRow } from "@/lib/types/player-ratings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { normalizeText } from "@/lib/soccerdata/normalize";

export const MIN_RATING_SAMPLE_SIZE = 3;
export const RATING_REGRESSION_BASELINE = 6.75;

export function resolvePlayerRating(row: SyncedPlayerRatingRow): number | undefined {
  if (row.club_avg_rating == null) return undefined;
  if (row.sample_size < MIN_RATING_SAMPLE_SIZE) {
    return RATING_REGRESSION_BASELINE;
  }
  return Number(row.club_avg_rating);
}

function collectPlayerIds(lineups: FixtureLineup[]): number[] {
  const ids = new Set<number>();
  for (const lineup of lineups) {
    for (const p of lineup.startXI) ids.add(p.player.id);
    for (const p of lineup.substitutes ?? []) ids.add(p.player.id);
  }
  return Array.from(ids);
}

export async function enrichLineupsWithRatings(
  lineups: FixtureLineup[],
  options: {
    entityType?: "club" | "national";
    supabase: SupabaseClient<Database>;
  }
): Promise<FixtureLineup[]> {
  void options.entityType;
  const playerIds = collectPlayerIds(lineups);
  if (!playerIds.length) return lineups;

  const { data, error } = await options.supabase
    .from("synced_player_ratings")
    .select("player_id, club_avg_rating, sample_size")
    .in("player_id", playerIds);

  if (error || !data?.length) return lineups;

  const byId = new Map(
    data.map((row) => [
      row.player_id,
      resolvePlayerRating({
        club_avg_rating: row.club_avg_rating != null ? Number(row.club_avg_rating) : null,
        sample_size: row.sample_size,
      }),
    ])
  );

  // Fallback: approximate ratings from SoFIFA overall when SofaScore player ratings are missing.
  // This is a best-effort heuristic keyed by (team_id, normalized player name).
  const teamIds = Array.from(new Set(lineups.map((l) => l.team.id))).filter((n) => Number.isFinite(n));
  const { data: sofifaRows } = await options.supabase
    .from("soccerdata_players")
    .select("team_id, name, sofifa_overall")
    .in("team_id", teamIds)
    .not("sofifa_overall", "is", null)
    .limit(20000);

  const sofifaByTeamAndName = new Map<string, number>();
  for (const row of sofifaRows ?? []) {
    const teamId = row.team_id;
    const overall = row.sofifa_overall;
    if (!teamId || overall == null) continue;
    const key = `${teamId}:${normalizeText(row.name)}`;
    if (!sofifaByTeamAndName.has(key)) sofifaByTeamAndName.set(key, Number(overall));
  }

  function sofifaToRating(overall: number): number {
    // Map 0–100 into ~[5.0, 8.0] to match SofaScore-ish rating scale.
    const clamped = Math.max(0, Math.min(100, overall));
    return 5 + (clamped / 100) * 3;
  }

  function resolveFallback(teamId: number, playerName: string): number | undefined {
    const overall = sofifaByTeamAndName.get(`${teamId}:${normalizeText(playerName)}`);
    if (overall == null) return undefined;
    return sofifaToRating(overall);
  }

  return lineups.map((lineup) => {
    const enrichPlayer = (slot: (typeof lineups)[0]["startXI"][0]) => {
      const averageRating =
        byId.get(slot.player.id) ?? resolveFallback(lineup.team.id, slot.player.name);
      const performanceScore = resolvePlayerPerformanceScore(
        averageRating != null ? ratingToPerformanceScore(averageRating) : LAV_BASELINE_SCORE
      );
      return {
        ...slot,
        player: {
          ...slot.player,
          averageRating,
          performanceScore,
        },
      };
    };
    return {
      ...lineup,
      startXI: lineup.startXI.map(enrichPlayer),
      substitutes: (lineup.substitutes ?? []).map(enrichPlayer),
    };
  });
}
