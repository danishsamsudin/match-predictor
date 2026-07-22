/**
 * GLPM match ingest — SportMonks primary, Wyscout secondary enrich.
 */

/** Wyscout enrich is off by default; set GLPM_WYSCOUT_ENRICH=1 to enable cron/manual enrich. */
export function isWyscoutEnrichEnabled(): boolean {
  const v = process.env.GLPM_WYSCOUT_ENRICH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase";
import type { SportmonksClient } from "../sportmonks/client";
import type { SmApiResponse, SmFixture } from "../sportmonks/types";
import { upsertSportmonksFixtureBundle } from "./layer1/sportmonks/upsertFixture";
import { buildAndUpsertMatchTeamFeatures } from "./layer2/buildMatchTeamFeatures";
import { validateAndPersistMatchBundle } from "./validation/validateMatchBundle";
import type { GlpmValidationStatus } from "./types";
import type { ValidationIssue } from "./validation/rules";
export {
  enrichMatchFromWyscout,
  enrichMatchFromWyscoutPayloads,
  upsertProviderEntityMap,
} from "./layer1/wyscout/enrichPpdaAndShots";

type Client = SupabaseClient<Database>;

export type IngestMatchResult = {
  matchSmId: number;
  homeTeamSmId: number;
  awayTeamSmId: number;
  eventCount: number;
  validationStatus: GlpmValidationStatus;
  issues: ValidationIssue[];
  featuresBuilt: boolean;
};

/** Primary path from a SportMonks fixture payload (tests / offline). */
export async function ingestMatchFromSportmonksPayload(
  supabase: Client,
  fixture: SmFixture,
  options?: { forceFeatures?: boolean; skipFeatures?: boolean }
): Promise<IngestMatchResult> {
  const { match, stats, eventCount } = await upsertSportmonksFixtureBundle(supabase, fixture);
  const home = stats.find((r) => r.is_home)!;
  const away = stats.find((r) => !r.is_home)!;

  const proxyFlags = (row: (typeof stats)[number]) => {
    const payload = row.payload as { xg_proxy?: boolean; psxg_proxy?: boolean } | null;
    return {
      xg_proxy: payload?.xg_proxy ?? false,
      psxg_proxy: payload?.psxg_proxy ?? false,
    };
  };
  const homeProxy = proxyFlags(home);
  const awayProxy = proxyFlags(away);

  const { issues, status } = await validateAndPersistMatchBundle(supabase, {
    home: {
      match_sm_id: home.match_sm_id,
      team_sm_id: home.team_sm_id,
      is_home: true,
      goals: home.goals ?? null,
      xg: home.xg ?? null,
      npxg: home.npxg ?? null,
      shots: home.shots ?? null,
      shots_on_target: home.shots_on_target ?? null,
      big_chances: home.big_chances ?? null,
      possession_pct: home.possession_pct ?? null,
      ppda: home.ppda ?? null,
      defensive_actions: home.defensive_actions ?? null,
      psxg_faced: home.psxg_faced ?? null,
      ...homeProxy,
    },
    away: {
      match_sm_id: away.match_sm_id,
      team_sm_id: away.team_sm_id,
      is_home: false,
      goals: away.goals ?? null,
      xg: away.xg ?? null,
      npxg: away.npxg ?? null,
      shots: away.shots ?? null,
      shots_on_target: away.shots_on_target ?? null,
      big_chances: away.big_chances ?? null,
      possession_pct: away.possession_pct ?? null,
      ppda: away.ppda ?? null,
      defensive_actions: away.defensive_actions ?? null,
      psxg_faced: away.psxg_faced ?? null,
      ...awayProxy,
    },
    knownTeamIds: new Set([match.home_team_sm_id, match.away_team_sm_id]),
  });

  let featuresBuilt = false;
  if (!options?.skipFeatures && (status !== "flagged" || options?.forceFeatures)) {
    await buildAndUpsertMatchTeamFeatures(supabase, {
      matchSmId: match.sm_id,
      force: options?.forceFeatures || status === "flagged",
    });
    featuresBuilt = true;
  }

  return {
    matchSmId: match.sm_id,
    homeTeamSmId: match.home_team_sm_id,
    awayTeamSmId: match.away_team_sm_id,
    eventCount,
    validationStatus: status,
    issues,
    featuresBuilt,
  };
}

/** Live SportMonks primary ingest. */
export async function ingestMatchFromSportmonks(
  supabase: Client,
  client: SportmonksClient,
  fixtureId: number,
  options?: { forceFeatures?: boolean; skipFeatures?: boolean }
): Promise<IngestMatchResult> {
  const res = (await client.getFixture(fixtureId)) as SmApiResponse<SmFixture> | SmFixture;
  const fixture: SmFixture =
    res && typeof res === "object" && "data" in res && (res as SmApiResponse<SmFixture>).data
      ? (res as SmApiResponse<SmFixture>).data
      : (res as SmFixture);
  if (!fixture.id) fixture.id = fixtureId;
  return ingestMatchFromSportmonksPayload(supabase, fixture, options);
}
