/**
 * Shared GLPM team list for a season (picker + SSR bootstrap).
 * Cached so /predict and /api/glpm/teams share warm results.
 */

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { loadGlpmHubCatalogCached } from "@/lib/glpm/hub-catalog";
import { loadPromotedTeamIds } from "@/lib/glpm/promotion";
import {
  shouldWarnPromotedTeam,
  TRAIN_FALLBACK_BY_LEAGUE,
} from "@/lib/glpm/resolve-train-season";
import { pickDefaultGlpmSeasonId } from "@/lib/glpm/season-ready";

type Client = SupabaseClient<Database>;

export type GlpmTeamPickerOption = {
  id: number;
  name: string;
  shortName: string | null;
  promotedWarning: boolean;
};

function getClient(): Client {
  return tryCreateServiceClient() ?? createServerClient();
}

async function loadTeamsForSeasonUncached(
  seasonId: number
): Promise<GlpmTeamPickerOption[]> {
  const client = getClient();

  const { data: vectors, error } = await client
    .from("glpm_team_rating_vectors")
    .select("team_sm_id")
    .eq("season_id", seasonId);
  if (error) throw new Error(error.message);

  let teamIds = [...new Set((vectors ?? []).map((v) => v.team_sm_id))];
  if (teamIds.length === 0) {
    const { data: matches } = await client
      .from("glpm_matches")
      .select("home_team_sm_id,away_team_sm_id")
      .eq("season_id", seasonId)
      .limit(500);
    const ids = new Set<number>();
    for (const m of matches ?? []) {
      ids.add(m.home_team_sm_id);
      ids.add(m.away_team_sm_id);
    }
    teamIds = [...ids];
  }

  if (teamIds.length === 0) return [];

  const promotedWarningIds = new Set<number>();
  const { data: seasonMeta } = await client
    .from("glpm_seasons")
    .select("sm_id,competition_id")
    .eq("sm_id", seasonId)
    .maybeSingle();
  const competitionId = seasonMeta?.competition_id ?? null;

  if (competitionId != null) {
    const priorSeasonIdRaw = TRAIN_FALLBACK_BY_LEAGUE[competitionId] ?? null;
    const priorSeasonId =
      priorSeasonIdRaw != null && priorSeasonIdRaw !== seasonId
        ? priorSeasonIdRaw
        : null;

    if (priorSeasonId != null) {
      const [{ data: seasonRows }, { data: priorVectorRows }] = await Promise.all([
        client
          .from("glpm_seasons")
          .select("sm_id,competition_id,start_date")
          .eq("competition_id", competitionId)
          .order("start_date", { ascending: false }),
        client
          .from("glpm_team_rating_vectors")
          .select("team_sm_id")
          .eq("season_id", priorSeasonId),
      ]);

      const seasons = (seasonRows ?? []).map((s) => ({
        smId: s.sm_id,
        competitionId: s.competition_id,
        startDate: s.start_date,
      }));
      const priorVectorIds = new Set(
        (priorVectorRows ?? []).map((r) => r.team_sm_id)
      );
      const promoted = await loadPromotedTeamIds(client, {
        seasonId,
        competitionId,
        currentTeamIds: teamIds,
        seasons,
      });

      for (const id of promoted) {
        if (
          shouldWarnPromotedTeam({
            isPromoted: true,
            priorSeasonId,
            seasonId,
            hasPriorSeasonVector: priorVectorIds.has(id),
          })
        ) {
          promotedWarningIds.add(id);
        }
      }
    }
  }

  const { data, error: teamsError } = await client
    .from("glpm_teams")
    .select("sm_id,name,official_name")
    .in("sm_id", teamIds)
    .order("name");
  if (teamsError) throw new Error(teamsError.message);

  return (data ?? []).map((t) => ({
    id: t.sm_id,
    name: t.name,
    shortName: t.official_name,
    promotedWarning: promotedWarningIds.has(t.sm_id),
  }));
}

const loadCachedTeamsForSeason = unstable_cache(
  async (seasonId: number): Promise<GlpmTeamPickerOption[]> =>
    loadTeamsForSeasonUncached(seasonId),
  ["glpm-teams-for-season-v1"],
  { revalidate: 120, tags: ["glpm-hub", "glpm-teams"] }
);

/** Cross-request team list for a season (120s). */
export async function loadGlpmTeamsForSeasonCached(
  seasonId: number
): Promise<GlpmTeamPickerOption[]> {
  if (!Number.isFinite(seasonId) || seasonId <= 0) return [];
  return loadCachedTeamsForSeason(seasonId);
}

export type GlpmPickerBootstrap = {
  competitions: {
    id: number;
    name: string;
    areaName: string | null;
    defaultSeasonId: number | null;
  }[];
  seasons: {
    id: number;
    name: string | null;
    competitionId: number;
    isPredictReady: boolean;
    hasFinishedMatches: boolean;
  }[];
  defaultSeasonId: number | null;
  teams: GlpmTeamPickerOption[];
  competitionId: string;
  seasonId: string;
};

/** Server bootstrap for club /predict dropdowns from URL search params. */
export async function loadGlpmPickerBootstrap(opts: {
  seasonId?: string | null;
  competitionId?: string | null;
}): Promise<GlpmPickerBootstrap> {
  const catalog = await loadGlpmHubCatalogCached();
  const competitions = catalog.competitionList.map((c) => ({
    id: c.smId,
    name: c.name,
    areaName: c.areaName,
    defaultSeasonId: c.defaultSeasonId,
  }));
  const seasons = catalog.seasonsForPayload.map((s) => ({
    id: s.smId,
    name: s.name,
    competitionId: s.competitionId,
    isPredictReady: s.isPredictReady,
    hasFinishedMatches: s.hasFinishedMatches,
  }));

  const prefillSeason = opts.seasonId?.trim() || "";
  const prefillCompetition = opts.competitionId?.trim() || "";

  let seasonId = "";
  let competitionId = "";

  if (prefillSeason && seasons.some((s) => String(s.id) === prefillSeason)) {
    const s = seasons.find((x) => String(x.id) === prefillSeason)!;
    seasonId = String(s.id);
    competitionId = String(s.competitionId);
  } else if (
    prefillCompetition &&
    competitions.some((c) => String(c.id) === prefillCompetition)
  ) {
    competitionId = prefillCompetition;
    const comp = competitions.find((c) => String(c.id) === competitionId)!;
    const preferred =
      (comp.defaultSeasonId != null &&
      seasons.some(
        (s) => s.competitionId === comp.id && s.id === comp.defaultSeasonId
      )
        ? comp.defaultSeasonId
        : null) ??
      seasons.find((s) => String(s.competitionId) === competitionId && s.isPredictReady)
        ?.id ??
      seasons.find(
        (s) => String(s.competitionId) === competitionId && s.hasFinishedMatches
      )?.id;
    if (preferred != null) seasonId = String(preferred);
  } else if (competitions.length) {
    const first = competitions[0];
    competitionId = String(first.id);
    const preferred =
      first.defaultSeasonId ??
      seasons.find((s) => s.competitionId === first.id && s.isPredictReady)?.id ??
      seasons.find((s) => s.competitionId === first.id && s.hasFinishedMatches)?.id;
    if (preferred != null) seasonId = String(preferred);
  }

  if (!seasonId) {
    const fallback = pickDefaultGlpmSeasonId(catalog.seasonList, catalog.readiness, null);
    if (fallback != null) {
      seasonId = String(fallback);
      const s = seasons.find((x) => x.id === fallback);
      if (s) competitionId = String(s.competitionId);
    }
  }

  const teams =
    seasonId && Number.isFinite(Number(seasonId))
      ? await loadGlpmTeamsForSeasonCached(Number(seasonId))
      : [];

  const defaultSeasonId = pickDefaultGlpmSeasonId(
    catalog.seasonList,
    catalog.readiness,
    competitionId ? Number(competitionId) : null
  );

  return {
    competitions,
    seasons,
    defaultSeasonId,
    teams,
    competitionId,
    seasonId,
  };
}
