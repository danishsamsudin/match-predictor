import { tryCreateServiceClient } from "@/lib/supabase";
import { computeXgEloFromMatches } from "@/lib/world-cup/graham-xg-elo";
import { computeWctrFromMatches } from "@/lib/world-cup/graham-tournament-rating";
import {
  loadMedianSquadValueForWcTeams,
  resolveSquadTalentSnapshot,
} from "@/lib/world-cup/national-squad-talent";

export async function persistNationalTeamRatings(
  allMatches: Parameters<typeof computeXgEloFromMatches>[0],
  teamIds: number[],
  teamNames: Map<number, string>
): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;

  const xgElo = computeXgEloFromMatches(allMatches, teamIds, teamNames);
  const wctr = computeWctrFromMatches(allMatches, teamIds, teamNames);
  const median = await loadMedianSquadValueForWcTeams();

  const rows: Array<{
    team_id: number;
    rating_type: string;
    rating: number;
    sample_weight: number;
  }> = [];

  for (const teamId of teamIds) {
    const name = teamNames.get(teamId);
    rows.push({
      team_id: teamId,
      rating_type: "xg_elo",
      rating: xgElo.get(teamId) ?? 1500,
      sample_weight: 1,
    });
    rows.push({
      team_id: teamId,
      rating_type: "tournament",
      rating: wctr.get(teamId) ?? 1500,
      sample_weight: 1,
    });
    const talent = await resolveSquadTalentSnapshot(teamId, name ?? "", median);
    rows.push({
      team_id: teamId,
      rating_type: "talent",
      rating: talent.talentRating * 400 + 1500,
      sample_weight: 1,
    });
  }

  await supabase.from("national_team_ratings").upsert(rows, {
    onConflict: "team_id,rating_type",
  });
}

export async function loadNationalTeamRating(
  teamId: number,
  ratingType: "xg_elo" | "tournament" | "talent"
): Promise<number | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("national_team_ratings")
    .select("rating")
    .eq("team_id", teamId)
    .eq("rating_type", ratingType)
    .maybeSingle();
  return data?.rating != null ? Number(data.rating) : null;
}
