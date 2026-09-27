import { enrichSquadPlayersWithClubScoutlyst } from "@/lib/data/enrich-squad-with-club-scoutlyst";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import {
  loadSofifaOverallByNames,
  loadSofifaOverallByTeam,
  resolveSofifaOverall,
} from "@/lib/data/resolve-squad-player-metrics";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import type { Database } from "@/lib/supabase";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type MissingNlSofifaPlayer = {
  teamId: number;
  teamName: string;
  playerName: string;
  position: string;
  performanceScore: number | null;
  sofifaOverall: number | null;
};

export type NlSofifaCoverageReport = {
  teamsChecked: number;
  rosterPlayers: number;
  withSofifa: number;
  withPerformanceScore: number;
  missingSofifa: MissingNlSofifaPlayer[];
  emptyRosters: Array<{ teamId: number; teamName: string }>;
};

async function loadNationalRoster(
  supabase: ServiceClient,
  teamId: number,
  teamName: string
): Promise<SquadPlayer[]> {
  const squad = await loadTeamSquadForComparison(
    supabase,
    teamId,
    teamName,
    undefined,
    "national"
  );
  const base = [...squad.starters, ...squad.substitutes];
  return enrichSquadPlayersWithClubScoutlyst(supabase, base);
}

/**
 * Cross-check Nations League squads against soccerdata Sofifa overalls.
 * Lists players that still lack a Sofifa overall after import/enrichment.
 */
export async function buildNlSofifaCoverageReport(
  supabase: ServiceClient,
  options?: { teamIds?: number[] }
): Promise<NlSofifaCoverageReport> {
  const teams = options?.teamIds?.length
    ? NATIONS_LEAGUE_2026_TEAMS.filter((t) => options.teamIds!.includes(t.id))
    : NATIONS_LEAGUE_2026_TEAMS;

  const missingSofifa: MissingNlSofifaPlayer[] = [];
  const emptyRosters: Array<{ teamId: number; teamName: string }> = [];
  let rosterPlayers = 0;
  let withSofifa = 0;
  let withPerformanceScore = 0;

  for (const team of teams) {
    const roster = await loadNationalRoster(supabase, team.id, team.name);
    if (!roster.length) {
      emptyRosters.push({ teamId: team.id, teamName: team.name });
      continue;
    }

    const names = roster.map((p) => formatPlayerDisplayNameIfNeeded(p.name));
    const [globalByName, teamByName] = await Promise.all([
      loadSofifaOverallByNames(supabase, names),
      loadSofifaOverallByTeam(supabase, team.id),
    ]);

    for (const player of roster) {
      rosterPlayers += 1;
      const display = formatPlayerDisplayNameIfNeeded(player.name);
      const sofifaOverall = resolveSofifaOverall(display, globalByName, teamByName);
      if (sofifaOverall != null) withSofifa += 1;
      if (player.performanceScore != null && player.performanceScore > 0) {
        withPerformanceScore += 1;
      }
      if (sofifaOverall == null) {
        missingSofifa.push({
          teamId: team.id,
          teamName: team.name,
          playerName: display,
          position: player.position,
          performanceScore: player.performanceScore,
          sofifaOverall: null,
        });
      }
    }
  }

  missingSofifa.sort(
    (a, b) =>
      a.teamName.localeCompare(b.teamName) || a.playerName.localeCompare(b.playerName)
  );

  return {
    teamsChecked: teams.length,
    rosterPlayers,
    withSofifa,
    withPerformanceScore,
    missingSofifa,
    emptyRosters,
  };
}
