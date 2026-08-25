/**
 * Cross-request cache for GLPM hub payloads (league switch / home leagues).
 */

import { unstable_cache } from "next/cache";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import {
  loadGlpmHubPayload,
  type LoadGlpmHubPayloadOpts,
  type GlpmHubPayload,
} from "@/lib/glpm/hub-load";
import { loadGlpmHubCatalogCached } from "@/lib/glpm/hub-catalog";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

export type CachedHubOpts = {
  seasonId?: number | null;
  competitionId?: number | null;
  preferFixtures?: boolean;
  includeWeather?: boolean;
  includeRecent?: boolean;
  upcomingLimit?: number;
};

/**
 * Cached hub load. Catalog is fetched once (also cached) and reused.
 * Revalidates every 60s so league switches after the first hit feel near-instant.
 */
export async function loadGlpmHubPayloadCached(
  opts: CachedHubOpts = {}
): Promise<GlpmHubPayload> {
  const seasonKey = opts.seasonId != null ? String(opts.seasonId) : "auto";
  const competitionKey =
    opts.competitionId != null ? String(opts.competitionId) : "auto";
  const preferFixtures = opts.preferFixtures === true;
  const includeWeather = opts.includeWeather === true;
  const includeRecent = opts.includeRecent !== false;
  const upcomingLimit = Math.max(1, opts.upcomingLimit ?? 24);

  const cacheKey = [
    "glpm-hub-payload-v2",
    seasonKey,
    competitionKey,
    preferFixtures ? "1" : "0",
    includeWeather ? "1" : "0",
    includeRecent ? "1" : "0",
    String(upcomingLimit),
  ];

  return unstable_cache(
    async (): Promise<GlpmHubPayload> => {
      const catalog = await loadGlpmHubCatalogCached();
      const loadOpts: LoadGlpmHubPayloadOpts = {
        seasonId: opts.seasonId ?? null,
        competitionId: opts.competitionId ?? null,
        preferFixtures,
        includeWeather,
        includeRecent,
        upcomingLimit,
        catalog,
      };
      return loadGlpmHubPayload(getClient(), loadOpts);
    },
    cacheKey,
    {
      revalidate: 60,
      tags: [
        "glpm-hub",
        `glpm-hub-season-${seasonKey}`,
        `glpm-hub-comp-${competitionKey}`,
      ],
    }
  )();
}
