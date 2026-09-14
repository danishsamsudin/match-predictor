/**
 * Build and persist GLPM home hub packs for the five Home leagues.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";
import { loadGlpmHubCatalog } from "@/lib/glpm/hub-catalog";
import { loadGlpmHubPayload } from "@/lib/glpm/hub-load";
import { GLPM_HOME_LEAGUE_NAMES } from "@/lib/glpm/run-upcoming-prediction-snapshots";
import { pickFixtureSeasonId, pickRatingSeasonId } from "@/lib/glpm/season-ready";
import {
  markGlpmHomeHubRefreshRunning,
  upsertGlpmHomeHubSnapshot,
  type GlpmHomeHubKind,
} from "@/lib/glpm/home-hub-snapshot";

export type RefreshGlpmHomeHubPacksResult = {
  ok: boolean;
  packsWritten: number;
  errors: string[];
  byLeague: Array<{
    league: string;
    competitionId: number | null;
    fixturesSeasonId: number | null;
    ratingsSeasonId: number | null;
    written: string[];
  }>;
};

function revalidateHomeCaches(): void {
  try {
    revalidateTag("glpm-hub", "max");
    revalidatePath("/home");
  } catch {
    // CLI / non-Next contexts
  }
}

export async function refreshGlpmHomeHubPacks(options?: {
  client?: SupabaseClient;
  competitionNames?: readonly string[];
  /** Upcoming fixture limit for fixtures packs (home default 48). */
  upcomingLimit?: number;
  includeWeather?: boolean;
}): Promise<RefreshGlpmHomeHubPacksResult> {
  const errors: string[] = [];
  const client = options?.client ?? tryCreateServiceClient();
  if (!client) {
    return {
      ok: false,
      packsWritten: 0,
      errors: ["Supabase service client unavailable"],
      byLeague: [],
    };
  }

  const names = options?.competitionNames ?? GLPM_HOME_LEAGUE_NAMES;
  const upcomingLimit = Math.max(1, options?.upcomingLimit ?? 48);
  const includeWeather = options?.includeWeather !== false;
  const catalog = await loadGlpmHubCatalog(client);
  const byLeague: RefreshGlpmHomeHubPacksResult["byLeague"] = [];
  let packsWritten = 0;

  for (const name of names) {
    const competition = catalog.competitionList.find(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );
    if (!competition) {
      errors.push(`Competition not found: ${name}`);
      byLeague.push({
        league: name,
        competitionId: null,
        fixturesSeasonId: null,
        ratingsSeasonId: null,
        written: [],
      });
      continue;
    }

    const fixtureSeasonId = pickFixtureSeasonId(
      catalog.seasonList,
      catalog.readiness,
      competition.smId
    );
    const ratingSeasonId = pickRatingSeasonId(
      catalog.seasonList,
      catalog.readiness,
      competition.smId
    );
    const written: string[] = [];

    const writeKind = async (
      kind: GlpmHomeHubKind,
      seasonId: number,
      loadOpts: {
        preferFixtures: boolean;
        upcomingLimit: number;
        includeWeather: boolean;
        includeRecent: boolean;
      }
    ) => {
      await markGlpmHomeHubRefreshRunning(client, {
        competitionSmId: competition.smId,
        seasonSmId: seasonId,
        kind,
      });
      try {
        const payload = await loadGlpmHubPayload(client, {
          competitionId: competition.smId,
          seasonId,
          preferFixtures: loadOpts.preferFixtures,
          upcomingLimit: loadOpts.upcomingLimit,
          includeWeather: loadOpts.includeWeather,
          includeRecent: loadOpts.includeRecent,
          preferStoredPredictions: true,
          catalog,
        });
        const err = await upsertGlpmHomeHubSnapshot(client, {
          competitionSmId: competition.smId,
          seasonSmId: seasonId,
          kind,
          payload,
        });
        if (err) {
          errors.push(`${name}/${kind}: ${err}`);
          return;
        }
        packsWritten += 1;
        written.push(kind);
      } catch (err) {
        errors.push(
          `${name}/${kind}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    if (fixtureSeasonId != null) {
      await writeKind("fixtures", fixtureSeasonId, {
        preferFixtures: true,
        upcomingLimit,
        includeWeather,
        includeRecent: false,
      });
    }

    if (ratingSeasonId != null && ratingSeasonId !== fixtureSeasonId) {
      await writeKind("ratings", ratingSeasonId, {
        preferFixtures: false,
        upcomingLimit: 0,
        includeWeather: false,
        includeRecent: false,
      });
    } else if (ratingSeasonId != null && fixtureSeasonId === ratingSeasonId) {
      // Ratings leaders live inside the fixtures pack when seasons match.
      written.push("ratings-via-fixtures");
    }

    byLeague.push({
      league: name,
      competitionId: competition.smId,
      fixturesSeasonId: fixtureSeasonId,
      ratingsSeasonId: ratingSeasonId,
      written,
    });
  }

  revalidateHomeCaches();

  return {
    ok: errors.length === 0,
    packsWritten,
    errors,
    byLeague,
  };
}
