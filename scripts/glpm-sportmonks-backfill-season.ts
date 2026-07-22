/**
 * Backfill SportMonks fixtures for a season into GLPM.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId>
 *   npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId> --limit 10
 *   npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId> --completed-only
 */
import fs from "node:fs";
import path from "node:path";
import { ingestMatchFromSportmonks } from "../src/lib/glpm/ingestMatch";
import { extractFixtureIds } from "../src/lib/glpm/sportmonks/fixtureSchedule";
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

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const forceFeatures = args.includes("--force-features");
  const completedOnly = args.includes("--completed-only");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const seasonArg = args.find(
    (a, i) =>
      !a.startsWith("-") &&
      (limitIdx < 0 || i !== limitIdx + 1) &&
      a !== "true" &&
      a !== "false"
  );

  if (!seasonArg) {
    console.error(
      "Usage: npx tsx scripts/glpm-sportmonks-backfill-season.ts <seasonId> [--limit N] [--completed-only]"
    );
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
  let fixtureIds = extractFixtureIds(schedule, { completedOnly });
  if (limit != null && Number.isFinite(limit)) fixtureIds = fixtureIds.slice(0, limit);

  const filterNote = completedOnly ? " (completed fixtures only)" : "";
  console.log(`Season ${seasonId}: ingesting ${fixtureIds.length} fixture(s)${filterNote}...`);

  if (fixtureIds.length === 0) {
    console.warn(
      completedOnly
        ? "No completed fixtures found in the schedule. Future seasons have nothing to train on yet."
        : "No fixtures found in schedule payload."
    );
    return;
  }

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
