export interface MatchPlayerRating {
  playerId: number;
  rating: number;
}

export interface SyncedPlayerRatingRow {
  club_avg_rating: number | null;
  sample_size: number;
}
