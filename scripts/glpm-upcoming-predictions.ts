#!/usr/bin/env npx tsx
/**
 * Seed glpm_cx_prediction_history for upcoming home-league fixtures.
 *
 * Prefer `npm run glpm:home-card-sync` when you also need hub pack rebuild + verify.
 *
 *   npx tsx scripts/glpm-upcoming-predictions.ts
 *   npx tsx scripts/glpm-upcoming-predictions.ts --force --max 12
 */

import { loadEnvLocal } from "./load-env-local";
import { runGlpmUpcomingPredictionSnapshots } from "../src/lib/glpm/run-upcoming-prediction-snapshots";

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
