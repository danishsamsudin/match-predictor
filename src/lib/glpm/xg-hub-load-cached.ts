/**
 * Cross-request cache for League xG hub payloads.
 */

import { unstable_cache } from "next/cache";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import {
  loadGlpmXgHubPayload,
  type LoadGlpmXgHubPayloadOpts,
} from "@/lib/glpm/xg-hub-load";
import type { GlpmXgHubPayload } from "@/lib/glpm/hub-types";
import { loadGlpmHubCatalogCached } from "@/lib/glpm/hub-catalog";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

export type CachedXgHubOpts = {
  seasonId?: number | null;
  competitionId?: number | null;
};

export async function loadGlpmXgHubPayloadCached(
  opts: CachedXgHubOpts = {}
): Promise<GlpmXgHubPayload> {
  const seasonKey = opts.seasonId != null ? String(opts.seasonId) : "auto";
  const competitionKey =
    opts.competitionId != null ? String(opts.competitionId) : "auto";

  const cacheKey = ["glpm-xg-hub-payload-v2", seasonKey, competitionKey];

  return unstable_cache(
    async (): Promise<GlpmXgHubPayload> => {
      const catalog = await loadGlpmHubCatalogCached();
      const loadOpts: LoadGlpmXgHubPayloadOpts = {
        seasonId: opts.seasonId ?? null,
        competitionId: opts.competitionId ?? null,
        catalog,
      };
      return loadGlpmXgHubPayload(getClient(), loadOpts);
    },
    cacheKey,
    {
      revalidate: 60,
      tags: [
        "glpm-xg-hub",
        `glpm-xg-hub-season-${seasonKey}`,
        `glpm-xg-hub-comp-${competitionKey}`,
      ],
    }
  )();
}
