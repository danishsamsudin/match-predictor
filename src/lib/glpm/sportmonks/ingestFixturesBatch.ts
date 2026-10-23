/**
 * Batch ingest SportMonks fixtures into GLPM (payload or live multi-fetch).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import {
  chunkIds,
  createSportmonksClient,
  PLAN_FIXTURE_INCLUDE,
  type SportmonksClient,
} from "../../sportmonks/client";
import { attachExpectedXgToFixtures } from "../../sportmonks/attachExpectedXg";
import type { SmFixture } from "../../sportmonks/types";
import { ingestMatchFromSportmonksPayload, type IngestMatchResult } from "../ingestMatch";

type Client = SupabaseClient<Database>;

export type BatchIngestOptions = {
  buildFeatures?: boolean;
  forceFeatures?: boolean;
  dryRun?: boolean;
  include?: string;
  /** Skip `/expected/fixtures` merge (default: attach when a SportMonks client is available). */
  skipExpectedXg?: boolean;
  client?: SportmonksClient;
  /** Cap global `/expected/fixtures` scan pages when fixtureIds filter misses. */
  expectedXgMaxScanPages?: number;
};

export type BatchIngestSummary = {
  attempted: number;
  ok: number;
  flagged: number;
  failed: number;
  errors: string[];
  results: IngestMatchResult[];
};

function emptySummary(): BatchIngestSummary {
  return { attempted: 0, ok: 0, flagged: 0, failed: 0, errors: [], results: [] };
}

export async function ingestFixturePayloads(
  supabase: Client,
  fixtures: SmFixture[],
  options?: BatchIngestOptions
): Promise<BatchIngestSummary> {
  const summary = emptySummary();
  if (options?.dryRun) {
    summary.attempted = fixtures.length;
    return summary;
  }

  let payloads = fixtures;
  if (!options?.skipExpectedXg && fixtures.length) {
    try {
      const client = options?.client ?? createSportmonksClient();
      payloads = await attachExpectedXgToFixtures(client, fixtures, {
        maxScanPages: options?.expectedXgMaxScanPages,
      });
    } catch (err) {
      summary.errors.push(
        `expected/fixtures enrich failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const fixture of payloads) {
    summary.attempted += 1;
    try {
      const result = await ingestMatchFromSportmonksPayload(supabase, fixture, {
        skipFeatures: !options?.buildFeatures,
        forceFeatures: Boolean(options?.forceFeatures),
      });
      summary.results.push(result);
      if (result.validationStatus === "flagged") summary.flagged += 1;
      else summary.ok += 1;
    } catch (err) {
      summary.failed += 1;
      summary.errors.push(
        `fixture ${fixture.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return summary;
}

/** Fetch by multi IDs (50/chunk) then ingest. */
export async function ingestFixturesByIds(
  supabase: Client,
  fixtureIds: number[],
  options?: BatchIngestOptions
): Promise<BatchIngestSummary> {
  const client = options?.client ?? createSportmonksClient();
  const include = options?.include ?? PLAN_FIXTURE_INCLUDE;
  const unique = [...new Set(fixtureIds.filter((id) => Number.isFinite(id)))];
  const all: SmFixture[] = [];

  for (const chunk of chunkIds(unique, 50)) {
    if (options?.dryRun) {
      all.push(...chunk.map((id) => ({ id } as SmFixture)));
      continue;
    }
    const res = await client.getFixturesMulti(chunk, include);
    const page = Array.isArray(res.data) ? res.data : [];
    all.push(...page);
  }

  if (options?.dryRun) {
    return { ...emptySummary(), attempted: unique.length };
  }
  return ingestFixturePayloads(supabase, all, { ...options, client });
}

export function fixtureToMatchdayRef(f: SmFixture) {
  return {
    id: f.id,
    startingAt: f.starting_at ?? null,
    seasonId: f.season_id ?? f.season?.id ?? null,
    leagueId: f.league_id ?? f.league?.id ?? null,
    stateId: f.state_id ?? f.state?.id ?? null,
  };
}
