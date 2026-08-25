/**
 * Shared GLPM competitions / seasons / readiness catalog.
 * Cached across requests so home + league hubs do not re-scan every navigation.
 */

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import {
  annotateSeasonReadiness,
  loadGlpmSeasonReadiness,
  pickDefaultGlpmSeasonId,
  type GlpmSeasonReadiness,
  type GlpmSeasonRef,
} from "@/lib/glpm/season-ready";

type Client = SupabaseClient<Database>;

export type GlpmHubCatalog = {
  seasonList: GlpmSeasonRef[];
  readiness: Map<number, GlpmSeasonReadiness>;
  competitionList: {
    smId: number;
    name: string;
    areaName: string | null;
    defaultSeasonId: number | null;
  }[];
  seasonsForPayload: {
    smId: number;
    name: string | null;
    competitionId: number;
    hasVectors: boolean;
    hasFinishedMatches: boolean;
    hasUpcomingMatches: boolean;
    isPredictReady: boolean;
  }[];
};

type CachedCatalog = {
  seasonList: GlpmSeasonRef[];
  readinessEntries: [number, GlpmSeasonReadiness][];
  competitionList: GlpmHubCatalog["competitionList"];
  seasonsForPayload: GlpmHubCatalog["seasonsForPayload"];
};

function getClient(): Client {
  return tryCreateServiceClient() ?? createServerClient();
}

export async function loadGlpmHubCatalog(client: Client): Promise<GlpmHubCatalog> {
  const [{ data: competitions }, { data: seasons }, readiness] = await Promise.all([
    client.from("glpm_competitions").select("sm_id,name,area_name").order("name"),
    client
      .from("glpm_seasons")
      .select("sm_id,name,competition_id,start_date")
      .order("start_date", { ascending: false }),
    loadGlpmSeasonReadiness(client),
  ]);

  const seasonList: GlpmSeasonRef[] = (seasons ?? []).map((s) => ({
    smId: s.sm_id,
    name: s.name,
    competitionId: s.competition_id,
    startDate: s.start_date,
  }));

  const competitionList = (competitions ?? []).map((c) => ({
    smId: c.sm_id,
    name: c.name,
    areaName: c.area_name,
    defaultSeasonId: pickDefaultGlpmSeasonId(seasonList, readiness, c.sm_id),
  }));

  const seasonsForPayload = annotateSeasonReadiness(seasonList, readiness).map((s) => ({
    smId: s.smId,
    name: s.name,
    competitionId: s.competitionId,
    hasVectors: s.hasVectors,
    hasFinishedMatches: s.hasFinishedMatches,
    hasUpcomingMatches: s.hasUpcomingMatches,
    isPredictReady: s.isPredictReady,
  }));

  return { seasonList, readiness, competitionList, seasonsForPayload };
}

function hydrateCatalog(cached: CachedCatalog): GlpmHubCatalog {
  return {
    seasonList: cached.seasonList,
    readiness: new Map(cached.readinessEntries),
    competitionList: cached.competitionList,
    seasonsForPayload: cached.seasonsForPayload,
  };
}

const loadCachedCatalogPayload = unstable_cache(
  async (): Promise<CachedCatalog> => {
    const catalog = await loadGlpmHubCatalog(getClient());
    return {
      seasonList: catalog.seasonList,
      readinessEntries: [...catalog.readiness.entries()],
      competitionList: catalog.competitionList,
      seasonsForPayload: catalog.seasonsForPayload,
    };
  },
  ["glpm-hub-catalog-v1"],
  { revalidate: 60, tags: ["glpm-hub", "glpm-hub-catalog"] }
);

/** Cross-request catalog (60s). Prefer this from RSC / route handlers. */
export async function loadGlpmHubCatalogCached(): Promise<GlpmHubCatalog> {
  return hydrateCatalog(await loadCachedCatalogPayload());
}
