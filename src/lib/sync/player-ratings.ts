import type { MatchPlayerRating } from "@/lib/types/player-ratings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

const MAX_RATING_SAMPLES = 5;

type ServiceClient = SupabaseClient<Database>;

export function normalizeMatchBestPlayers(raw: unknown): MatchPlayerRating[] {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(root.bestPlayers)
    ? root.bestPlayers
    : Array.isArray(root.players)
      ? root.players
      : Array.isArray(root.playerRatings)
        ? root.playerRatings
        : [];

  const result: MatchPlayerRating[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const player =
      row.player && typeof row.player === "object"
        ? (row.player as Record<string, unknown>)
        : row;
    const id = Number(player.id ?? row.playerId ?? row.id);
    const rating = Number(
      row.rating ?? row.value ?? row.averageRating ?? player.rating ?? player.averageRating
    );
    if (!Number.isFinite(id) || !Number.isFinite(rating)) continue;
    result.push({ playerId: id, rating });
  }
  return result;
}

async function loadExistingRating(
  supabase: ServiceClient,
  playerId: number
): Promise<{ ratings: number[] } | null> {
  const { data } = await supabase
    .from("synced_player_ratings")
    .select("ratings, club_avg_rating, sample_size")
    .eq("player_id", playerId)
    .maybeSingle();

  if (!data) return null;
  const stored = data.ratings;
  if (Array.isArray(stored) && stored.every((v) => typeof v === "number")) {
    return { ratings: stored as number[] };
  }
  if (data.club_avg_rating != null && data.sample_size > 0) {
    return { ratings: Array(data.sample_size).fill(Number(data.club_avg_rating)) };
  }
  return null;
}

function rollingAverage(ratings: number[]): { avg: number; sampleSize: number } {
  const slice = ratings.slice(0, MAX_RATING_SAMPLES);
  const sampleSize = slice.length;
  const avg = slice.reduce((sum, r) => sum + r, 0) / sampleSize;
  return { avg: Math.round(avg * 100) / 100, sampleSize };
}

/** Merge match ratings into synced_player_ratings (club matches only). */
export async function upsertPlayerRatingsFromMatch(
  supabase: ServiceClient,
  matchRatings: MatchPlayerRating[],
  syncedAt: string
): Promise<void> {
  for (const { playerId, rating } of matchRatings) {
    const existing = await loadExistingRating(supabase, playerId);
    const ratings = [rating, ...(existing?.ratings ?? [])].slice(0, MAX_RATING_SAMPLES);
    const { avg, sampleSize } = rollingAverage(ratings);

    await supabase.from("synced_player_ratings").upsert({
      player_id: playerId,
      club_avg_rating: avg,
      sample_size: sampleSize,
      ratings,
      synced_at: syncedAt,
    });
  }
}
