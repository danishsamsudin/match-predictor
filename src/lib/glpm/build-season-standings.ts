/**
 * Shared season standings build from glpm_matches (+ seeds).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { computeStandings } from "@/lib/glpm/compute-standings";
import type { GlpmStandingRow } from "@/lib/glpm/hub-types";
import {
  fingerprintFinishedResults,
  type FinishedResultFingerprintInput,
} from "@/lib/glpm/standings-movement";

type Client = SupabaseClient<Database>;

export type SeasonStandingsBuild = {
  rows: GlpmStandingRow[];
  fingerprint: string;
  finishedFingerprintInputs: FinishedResultFingerprintInput[];
};

export async function buildSeasonStandingsFromMatches(
  client: Client,
  seasonId: number
): Promise<SeasonStandingsBuild> {
  const [{ data: finished }, { data: allSeasonMatches }, { data: vectorRows }, { data: teams }] =
    await Promise.all([
      client
        .from("glpm_matches")
        .select(
          "sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,match_date,kickoff_at"
        )
        .eq("season_id", seasonId)
        .not("home_score", "is", null)
        .not("away_score", "is", null)
        .limit(800),
      client
        .from("glpm_matches")
        .select("home_team_sm_id,away_team_sm_id")
        .eq("season_id", seasonId)
        .limit(1200),
      client
        .from("glpm_team_rating_vectors")
        .select("team_sm_id")
        .eq("season_id", seasonId),
      client.from("glpm_teams").select("sm_id,name"),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.sm_id, t.name] as const));

  const seedIds = new Set<number>();
  for (const m of allSeasonMatches ?? []) {
    seedIds.add(m.home_team_sm_id);
    seedIds.add(m.away_team_sm_id);
  }
  for (const v of vectorRows ?? []) {
    seedIds.add(v.team_sm_id);
  }
  for (const m of finished ?? []) {
    seedIds.add(m.home_team_sm_id);
    seedIds.add(m.away_team_sm_id);
  }

  const seeds = [...seedIds].map((id) => ({
    teamSmId: id,
    teamName: teamName.get(id) ?? `Team ${id}`,
  }));

  const finishedFingerprintInputs: FinishedResultFingerprintInput[] = [];
  const matchInputs = (finished ?? [])
    .filter((m) => m.home_score != null && m.away_score != null)
    .map((m) => {
      const homeScore = Number(m.home_score);
      const awayScore = Number(m.away_score);
      finishedFingerprintInputs.push({
        matchSmId: m.sm_id,
        homeScore,
        awayScore,
      });
      return {
        homeTeamSmId: m.home_team_sm_id,
        awayTeamSmId: m.away_team_sm_id,
        homeScore,
        awayScore,
        sortKey: m.kickoff_at ?? m.match_date ?? "",
      };
    });

  const rows = computeStandings(matchInputs, seeds);
  const fingerprint = fingerprintFinishedResults(finishedFingerprintInputs);

  return { rows, fingerprint, finishedFingerprintInputs };
}
