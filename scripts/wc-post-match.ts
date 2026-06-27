/**
 * Post-match WC pipeline: ingest Opta articles + player stats → form → ratings → sync → evaluate → calibrate → ml-train → report.
 *
 * Usage:
 *   npx tsx scripts/wc-post-match.ts
 *     → ingests all *.html in data/world-cup-2026/WC-Opta-Results
 *   npx tsx scripts/wc-post-match.ts /path/to/article.html [...]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertOptaHtmlBundle,
  expectedOptaFilesDir,
  listWcOptaResultHtmlFiles,
  WC_OPTA_RESULTS_DIR,
} from "../src/lib/world-cup/wc-opta-results-dir";
import {
  listWcPlayerStatsFixtures,
} from "../src/lib/world-cup/wc-player-stats-dir";

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveHtmlFiles(argv: string[]): string[] {
  const explicit = argv.map((f) => f.trim()).filter((f) => f && !f.startsWith("-"));
  if (explicit.length) return explicit;
  return listWcOptaResultHtmlFiles();
}

function validateBundles(files: string[]): void {
  const missing: string[] = [];
  for (const file of files) {
    try {
      assertOptaHtmlBundle(file);
    } catch {
      missing.push(file);
    }
  }
  if (!missing.length) return;

  console.error("Cannot run post-match pipeline — missing Opta _files folders:\n");
  for (const file of missing) {
    console.error(`  • ${path.basename(file)}`);
    console.error(`    expected: ${expectedOptaFilesDir(file)}\n`);
  }
  console.error(
    "Save each article as “Web Page, Complete” and copy both the .html and _files folder into WC-Opta-Results."
  );
  process.exit(1);
}

function main() {
  const files = resolveHtmlFiles(process.argv.slice(2));
  if (!files.length) {
    console.error(
      `No Opta HTML files found. Add *.html articles to:\n  ${WC_OPTA_RESULTS_DIR}\n\nOr pass paths:\n  npm run wc:postmatch -- path/to/article.html`
    );
    process.exit(1);
  }

  const playerFixtures = listWcPlayerStatsFixtures();

  console.log(`Processing ${files.length} Opta article(s) from WC-Opta-Results:\n`);
  for (const file of files) {
    console.log(`  • ${path.basename(file)}`);
  }
  console.log(`\nPlayer-stats fixtures in WC-Opta-Player-Stats: ${playerFixtures.length}`);
  console.log("");

  validateBundles(files);

  run("npx", ["tsx", "scripts/wc-postmatch-snapshot.ts", ...files]);
  run("npx", ["tsx", "scripts/wc-ingest-opta-html.ts", ...files]);
  run("npm", ["run", "wc:ingest-player-stats"]);
  run("npm", ["run", "wc:recompute-wc-form"]);
  run("npm", ["run", "statsbomb:import"]);
  run("npm", ["run", "xg-elo:recompute"]);
  run("npx", ["tsx", "scripts/wc-sync-cli.ts"]);
  run("npx", ["tsx", "scripts/wc-evaluate-predictions.ts"]);
  run("npx", ["tsx", "scripts/wc-evaluate-player-props.ts"]);
  run("npx", ["tsx", "scripts/wc-calibrate-graham.ts"]);
  run("npx", ["tsx", "scripts/ml-backfill-training-examples.ts"]);
  run("npm", ["run", "wc:ml-train"]);
  run("npx", ["tsx", "scripts/wc-post-match-report.ts"]);

  console.log("\nPost-match pipeline complete.");
  console.log(`  See the WC POST-MATCH SUMMARY above for collected data, model changes, and holdout performance.`);

  maybeTriggerMlPipelineWorkflow();
}

function maybeTriggerMlPipelineWorkflow(): void {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  const [owner, name] = repo.split("/");
  if (!owner || !name) return;

  const body = JSON.stringify({ event_type: "postmatch_complete" });
  const proc = spawnSync(
    "curl",
    [
      "-sS",
      "-X",
      "POST",
      "-H",
      `Authorization: token ${token}`,
      "-H",
      "Accept: application/vnd.github+json",
      `https://api.github.com/repos/${owner}/${name}/dispatches`,
      "-d",
      body,
    ],
    { stdio: "pipe", encoding: "utf8" }
  );
  if (proc.status === 0) {
    console.log("  GitHub Actions ml-pipeline workflow dispatched.");
  } else {
    console.warn("  GitHub dispatch skipped or failed (optional).");
  }
}

main();
