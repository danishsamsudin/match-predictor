/**
 * Post-match Nations League pipeline:
 * ingest Opta articles → player stats → recompute ratings → hub refresh.
 *
 * Usage:
 *   npx tsx scripts/nl-post-match.ts
 *     → ingests all *.html in data/nations-league-2026/NL-Opta-Results
 *   npx tsx scripts/nl-post-match.ts /path/to/article.html [...]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertOptaHtmlBundle,
  expectedOptaFilesDir,
  listNlOptaResultHtmlFiles,
  NL_OPTA_RESULTS_DIR,
} from "../src/lib/nations-league/nl-opta-results-dir";
import { summarizeNlPlayerStatsDir } from "../src/lib/nations-league/nl-player-stats-dir";
import { refreshNationsLeagueHubSnapshot } from "../src/lib/nations-league/hub-load";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const pathMod = require("path") as typeof import("path");
  const envPath = pathMod.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

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
  return listNlOptaResultHtmlFiles();
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

  console.error("Cannot run NL post-match pipeline - missing Opta _files folders:\n");
  for (const file of missing) {
    console.error(`  • ${path.basename(file)}`);
    console.error(`    expected: ${expectedOptaFilesDir(file)}\n`);
  }
  console.error(
    "Save each article as “Web Page, Complete” and copy both the .html and _files folder into NL-Opta-Results."
  );
  process.exit(1);
}

function step(n: number, total: number, title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Step ${n}/${total}: ${title}`);
  console.log("=".repeat(60));
}

async function main() {
  loadEnvLocal();
  const totalSteps = 5;
  const files = resolveHtmlFiles(process.argv.slice(2));
  const playerSummary = summarizeNlPlayerStatsDir();

  console.log("NL post-match pipeline starting");
  console.log(`  Articles found: ${files.length} under ${NL_OPTA_RESULTS_DIR}`);
  console.log(
    `  Player-stats fixtures: ${playerSummary.fixtures.length} ` +
      `(MS ${playerSummary.htmlCounts.matchSummary} / OS ${playerSummary.htmlCounts.optaSummary} / MD ${playerSummary.htmlCounts.matchDetails})`
  );
  if (playerSummary.unparsed.length) {
    console.warn(
      `  WARNING: ${playerSummary.unparsed.length} player-stats HTML file(s) failed filename parse`
    );
  }

  step(1, totalSteps, "Opta Analyst articles (match scores + process metrics)");
  if (!files.length) {
    console.log(
      `No Opta HTML in ${NL_OPTA_RESULTS_DIR} yet - skipping article ingest (empty-safe).`
    );
    console.log(
      "Without articles, player-stats ingest will still mark matches finished from Betting Showcase scores."
    );
  } else {
    console.log(`Processing ${files.length} Opta article(s):\n`);
    for (const file of files) {
      console.log(`  • ${path.basename(file)}`);
    }
    validateBundles(files);
    run("npx", ["tsx", "scripts/nl-ingest-opta-html.ts", ...files]);
  }

  step(2, totalSteps, "Player-stats ingest (Betting Showcase)");
  if (!playerSummary.fixtures.length) {
    console.log("No parseable player-stats fixtures found.");
    if (
      playerSummary.htmlCounts.matchSummary +
        playerSummary.htmlCounts.optaSummary +
        playerSummary.htmlCounts.matchDetails >
      0
    ) {
      console.error(
        "HTML is present but filenames did not parse - aborting so this is not silently skipped."
      );
      process.exit(1);
    }
  } else {
    console.log("Discovered fixtures:");
    for (const f of playerSummary.fixtures) {
      const pages = [
        f.matchSummary ? "MS" : null,
        f.optaSummary ? "OS" : null,
        f.matchDetails ? "MD" : null,
      ]
        .filter(Boolean)
        .join("+");
      console.log(
        `  • ${f.homeName} vs ${f.awayName} (${f.matchDate ?? "?"}) [${pages || "no pages"}]`
      );
    }
  }
  run("npm", ["run", "nl:ingest-player-stats"]);

  step(3, totalSteps, "Recompute NL ratings (xG-Elo / WCTR / talent)");
  run("npm", ["run", "nl:recompute-ratings"]);

  step(4, totalSteps, "Refresh Nations League hub snapshot");
  const payload = await refreshNationsLeagueHubSnapshot();
  if (!payload) {
    console.error("Hub refresh returned null (check Supabase / NL fixtures).");
    process.exit(1);
  }
  console.log(
    `Hub snapshot refreshed - recent ${payload.recent.length}, upcoming ${payload.upcoming.length}.`
  );

  step(5, totalSteps, "Evaluate + calibrate NL player goal markets");
  run("npx", ["tsx", "scripts/nl-evaluate-player-props.ts"]);
  run("npx", ["tsx", "scripts/nl-calibrate-player-props.ts"]);

  console.log(`\n${"=".repeat(60)}`);
  console.log("NL post-match pipeline complete.");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
