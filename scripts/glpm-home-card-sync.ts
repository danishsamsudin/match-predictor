#!/usr/bin/env npx tsx
/**
 * Keep homepage upcoming cards aligned with Predict (GLPM-CX).
 *
 * Off-peak daily job:
 *   1) Force-write CX snapshots for open home-league fixtures
 *   2) Rebuild home hub packs
 *   3) Verify pack markets match latest CX rows
 *
 *   npm run glpm:home-card-sync
 *   npm run glpm:home-card-sync -- --max 24
 *   npm run glpm:home-card-sync -- --no-force
 *   npm run glpm:home-card-sync -- --verify-only
 */

import { loadEnvLocal } from "./load-env-local";
import { runGlpmHomeCardSync } from "../src/lib/glpm/home-card-sync";

function parseArgs(argv: string[]) {
  let force = true;
  let maxPerCompetition = 48;
  let skipPredict = false;
  let skipHubRefresh = false;
  let skipVerify = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-force") force = false;
    if (a === "--force") force = true;
    if (a === "--verify-only") {
      skipPredict = true;
      skipHubRefresh = true;
      skipVerify = false;
    }
    if (a === "--skip-verify") skipVerify = true;
    if (a === "--max" && argv[i + 1]) {
      maxPerCompetition = Number(argv[++i]);
    }
  }
  return {
    force,
    maxPerCompetition: Number.isFinite(maxPerCompetition)
      ? maxPerCompetition
      : 48,
    skipPredict,
    skipHubRefresh,
    skipVerify,
  };
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  console.log("GLPM home card sync", opts);
  const result = await runGlpmHomeCardSync(opts);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        predictions: {
          ok: result.predictions.ok,
          fixturesAttempted: result.predictions.fixturesAttempted,
          predictionsWritten: result.predictions.predictionsWritten,
          skippedFresh: result.predictions.skippedFresh,
          skippedNoVectors: result.predictions.skippedNoVectors,
          byCompetition: result.predictions.byCompetition,
          errors: result.predictions.errors,
        },
        homeHubPacks: {
          ok: result.homeHubPacks.ok,
          packsWritten: result.homeHubPacks.packsWritten,
          byLeague: result.homeHubPacks.byLeague,
          errors: result.homeHubPacks.errors,
        },
        verify: {
          checked: result.verify.checked,
          matched: result.verify.matched,
          mismatchCount: result.verify.mismatches.length,
          mismatches: result.verify.mismatches.slice(0, 40),
        },
        errors: result.errors,
      },
      null,
      2
    )
  );

  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
