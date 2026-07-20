/**
 * Backfill SportMonks fixtures for a season into GLPM.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId>
 *   npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId> --limit 10
 */
import fs from "node:fs";
import path from "node:path";
import { ingestMatchFromSportmonks } from "../src/lib/glpm/ingestMatch";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { createSportmonksClient } from "../src/lib/sportmonks/client";

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

/**
 * Collect SportMonks fixture IDs from a schedules/seasons payload.
 * Stages and rounds also have id + league_id + starting_at — only use
 * objects nested under a `fixtures` array (or names like "Team A vs Team B").
 */
function extractFixtureIds(payload: unknown): number[] {
  const ids: number[] = [];
  const walk = (node: unknown, parentKey: string | null) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parentKey);
      return;
    }
    const obj = node as Record<string, unknown>;
    const id = obj.id;
    if (typeof id === "number") {
      const name = typeof obj.name === "string" ? obj.name : "";
      const underFixtures = parentKey === "fixtures";
      const looksLikeFixture =
        underFixtures ||
        (typeof obj.starting_at === "string" &&
          obj.starting_at.includes(":") &&
          (/\bvs\b/i.test(name) || obj.state_id != null || obj.round_id != null));
      if (looksLikeFixture) ids.push(id);
    }
    for (const [k, v] of Object.entries(obj)) walk(v, k);
  };
  walk(payload, null);
  return [...new Set(ids)];
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const forceFeatures = args.includes("--force-features");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const seasonArg = args.find((a, i) => !a.startsWith("-") && (limitIdx < 0 || i !== limitIdx + 1));

  if (!seasonArg) {
    console.error("Usage: npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId> [--limit N]");
    process.exit(1);
  }

  const seasonId = Number(seasonArg);
  if (!Number.isFinite(seasonId)) {
    console.error(`Invalid seasonId: ${seasonArg}`);
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const client = createSportmonksClient();
  const schedule = await client.getSeasonSchedule(seasonId);
  let fixtureIds = extractFixtureIds(schedule);
  if (limit != null && Number.isFinite(limit)) fixtureIds = fixtureIds.slice(0, limit);

  console.log(`Season ${seasonId}: ingesting ${fixtureIds.length} fixture(s)...`);

  let ok = 0;
  let flagged = 0;
  let failed = 0;

  for (const fixtureId of fixtureIds) {
    try {
      const result = await ingestMatchFromSportmonks(supabase, client, fixtureId, { forceFeatures });
      console.log(
        `  fixture ${fixtureId}: ${result.validationStatus} (events=${result.eventCount}, features=${result.featuresBuilt})`
      );
      if (result.validationStatus === "flagged") flagged += 1;
      else ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`  fixture ${fixtureId} FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone: ok=${ok}, flagged=${flagged}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
