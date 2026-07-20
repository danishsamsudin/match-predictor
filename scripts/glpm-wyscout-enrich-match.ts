/**
 * Secondary: enrich a SportMonks-ingested match with Wyscout PPDA / shots / xG gaps.
 *
 * Usage:
 *   npx tsx scripts/glpm-wyscout-enrich-match.ts <matchSmId>
 *   npx tsx scripts/glpm-wyscout-enrich-match.ts <matchSmId> --wy <wyscoutMatchId>
 *   npx tsx scripts/glpm-wyscout-enrich-match.ts --mock
 *
 * Requires glpm_provider_entity_map rows for match + both teams (unless --mock with built-in map).
 */
import fs from "node:fs";
import path from "node:path";
import {
  enrichMatchFromWyscout,
  enrichMatchFromWyscoutPayloads,
  upsertProviderEntityMap,
} from "../src/lib/glpm/ingestMatch";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { createWyscoutClient } from "../src/lib/wyscout/client";
import type {
  WyscoutMatchAdvancedStatsPayload,
  WyscoutMatchEventsPayload,
} from "../src/lib/wyscout/types";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function readMockJson<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "src/lib/wyscout/mock", name), "utf8")
  ) as T;
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const forceFeatures = args.includes("--force-features");
  const wyIdx = args.indexOf("--wy");
  const explicitWy = wyIdx >= 0 ? Number(args[wyIdx + 1]) : undefined;
  const smArg = args.find((a, i) => !a.startsWith("-") && (wyIdx < 0 || i !== wyIdx + 1));

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  if (useMock) {
    // Mock assumes SM fixture 19135515 already ingested; maps Arsenal 19↔1612, Chelsea 18↔1610
    const matchSmId = 19135515;
    await upsertProviderEntityMap(supabase, {
      entityType: "match",
      smId: matchSmId,
      providerEntityId: 5153807,
    });
    await upsertProviderEntityMap(supabase, {
      entityType: "team",
      smId: 19,
      providerEntityId: 1612,
    });
    await upsertProviderEntityMap(supabase, {
      entityType: "team",
      smId: 18,
      providerEntityId: 1610,
    });

    const advancedStats = readMockJson<WyscoutMatchAdvancedStatsPayload>("match_advancedstats.json");
    const events = readMockJson<WyscoutMatchEventsPayload>("match_events.json");
    const teamSmIdByWyId = new Map<number, number>([
      [1612, 19],
      [1610, 18],
    ]);
    const result = await enrichMatchFromWyscoutPayloads(supabase, {
      matchSmId,
      wyscoutMatchId: 5153807,
      advancedStats,
      events,
      teamSmIdByWyId,
      forceFeatures,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!smArg) {
    console.error("Usage: npx tsx scripts/glpm-wyscout-enrich-match.ts <matchSmId> [--wy wyId] | --mock");
    process.exit(1);
  }

  const matchSmId = Number(smArg);
  if (!Number.isFinite(matchSmId)) {
    console.error(`Invalid matchSmId: ${smArg}`);
    process.exit(1);
  }

  const client = createWyscoutClient();
  const result = await enrichMatchFromWyscout(supabase, client, matchSmId, {
    wyscoutMatchId: explicitWy,
    forceFeatures,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
