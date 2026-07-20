/**
 * Weekly SportMonks schedule refresh for GLPM.
 *
 * Pulls schedules for configured season IDs, extracts fixture IDs from the
 * schedule payload, and ingests each fixture into GLPM (idempotent upserts).
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-refresh-schedules.ts
 *   npx tsx scripts/glpm-sportmonks-refresh-schedules.ts 28083 27958 --window-all
 *   npx tsx scripts/glpm-sportmonks-refresh-schedules.ts --window-all --build-features
 */
import fs from "node:fs";
import path from "node:path";
import { refreshSportmonksSchedulesWithDefaults, getDefaultSportmonksSeasonIds2026_27 } from "../src/lib/glpm/sportmonks/refreshSchedules";

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

function parseNumberArg(name: string): number | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  const raw = process.argv[idx + 1];
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);

  const windowAll = args.includes("--window-all");
  const buildFeatures = args.includes("--build-features");
  const forceFeatures = args.includes("--force-features");
  const dryRun = args.includes("--dry-run");

  const maxFixtures = parseNumberArg("--max-fixtures");
  const pastDays = parseNumberArg("--past-days");
  const futureDays = parseNumberArg("--future-days");

  const valueFlags = new Set([
    "--max-fixtures",
    "--past-days",
    "--future-days",
  ]);
  const positionalSeasonIds: number[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("-")) {
      if (valueFlags.has(arg)) i += 1;
      continue;
    }
    const n = Number(arg);
    if (Number.isFinite(n)) positionalSeasonIds.push(n);
  }

  const envSeasonIds = process.env.SPORTMONKS_REFRESH_SEASON_IDS
    ? process.env.SPORTMONKS_REFRESH_SEASON_IDS.split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
    : undefined;

  const seasonIds = positionalSeasonIds.length
    ? positionalSeasonIds
    : envSeasonIds && envSeasonIds.length
      ? envSeasonIds
      : getDefaultSportmonksSeasonIds2026_27();

  console.log("SportMonks schedule refresh");
  console.log(`  seasons: ${seasonIds.join(", ")}`);
  console.log(`  windowAll: ${windowAll}`);
  console.log(`  pastDays/futureDays: ${pastDays ?? "(default)"} / ${futureDays ?? "(default)"}`);
  console.log(`  buildFeatures: ${buildFeatures}`);
  console.log(`  forceFeatures: ${forceFeatures}`);
  console.log(`  maxFixtures: ${maxFixtures ?? "(none)"}`);
  console.log(`  dryRun: ${dryRun}`);

  const summary = await refreshSportmonksSchedulesWithDefaults({
    seasonIds,
    windowAll,
    pastDays,
    futureDays,
    buildFeatures,
    forceFeatures,
    maxFixtures,
    dryRun,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (summary.totals.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

