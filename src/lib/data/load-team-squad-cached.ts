/**
 * Cross-request cache for team squad snapshots used by the XI picker.
 * Base roster is cached without opponent-specific BuliNews overlays so the
 * same national team stays warm across fixture switches.
 */

import { unstable_cache } from "next/cache";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { TeamSquadSnapshot } from "@/lib/types/team-comparison";

/** 10 minutes: national/club usual XIs change slowly between syncs. */
export const TEAM_SQUAD_CACHE_REVALIDATE_SECONDS = 600;

export async function loadTeamSquadForComparisonCached(
  teamId: number,
  teamName?: string,
  domesticLeagueId?: number,
  entityType?: EntityType
): Promise<TeamSquadSnapshot> {
  const nameKey = teamName?.trim() ?? "";
  const leagueKey =
    domesticLeagueId != null && Number.isFinite(domesticLeagueId)
      ? String(domesticLeagueId)
      : "";
  const entityKey = entityType ?? "";

  return unstable_cache(
    async (): Promise<TeamSquadSnapshot> => {
      const supabase = tryCreateServiceClient();
      return loadTeamSquadForComparison(
        supabase,
        teamId,
        nameKey || undefined,
        leagueKey ? Number(leagueKey) : undefined,
        entityKey === "national" || entityKey === "club"
          ? entityKey
          : undefined
      );
    },
    ["team-squad-v1", String(teamId), nameKey, leagueKey, entityKey],
    {
      revalidate: TEAM_SQUAD_CACHE_REVALIDATE_SECONDS,
      tags: ["team-squad", `team-squad-${teamId}`],
    }
  )();
}
