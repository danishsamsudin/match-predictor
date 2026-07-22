#!/usr/bin/env npx tsx
/**
 * Seed glpm_prediction_history for upcoming home-league fixtures.
 *
 *   npx tsx scripts/glpm-upcoming-predictions.ts
 *   npx tsx scripts/glpm-upcoming-predictions.ts --force --max 12
 */

import fs from "node:fs";
import path from "node:path";
import { runGlpmUpcomingPredictionSnapshots } from "../src/lib/glpm/run-upcoming-prediction-snapshots";

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

function parseArgs(argv: string[]) {
  let force = false;
  let maxPerCompetition = 48;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") force = true;
    if (a === "--max" && argv[i + 1]) {
      maxPerCompetition = Number(argv[++i]);
    }
  }
  return {
    force,
    maxPerCompetition: Number.isFinite(maxPerCompetition) ? maxPerCompetition : 48,
  };
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  console.log("GLPM upcoming prediction snapshots", opts);
  const result = await runGlpmUpcomingPredictionSnapshots(opts);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
