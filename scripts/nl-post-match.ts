/**
 * Post-match Nations League pipeline.
 * One command scores and retunes every match market and player market, then
 * prints a plain-language summary of what changed.
 *
 * Usage:
 *   npx tsx scripts/nl-post-match.ts
 *     → ingests all *.html in data/nations-league-2026/NL-Opta-Results
 *   npx tsx scripts/nl-post-match.ts /path/to/article.html [...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assertOptaHtmlBundle,
  expectedOptaFilesDir,
  listNlOptaResultHtmlFiles,
  NL_OPTA_RESULTS_DIR,
} from "../src/lib/nations-league/nl-opta-results-dir";
import { summarizeNlPlayerStatsDir } from "../src/lib/nations-league/nl-player-stats-dir";
import {
  fillNlLeaguePhasePredictions,
  refreshNationsLeagueHubSnapshot,
} from "../src/lib/nations-league/hub-load";
import type { NlPostMatchRunFacts } from "../src/lib/nations-league/build-nl-post-match-summary";

const fsExists = (p: string) => fs.existsSync(p);
const fsReaddir = (p: string) => fs.readdirSync(p);

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

function writeRunFacts(facts: NlPostMatchRunFacts) {
  const outDir = path.join(process.cwd(), "data/reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "nl-last-run.json"),
    JSON.stringify(facts, null, 2)
  );
}

async function main() {
  loadEnvLocal();
  const totalSteps = 12;
  const files = resolveHtmlFiles(process.argv.slice(2));
  const playerSummary = summarizeNlPlayerStatsDir();
  const sofifaDir = path.join(
    process.cwd(),
    "data/nations-league-2026/nl-scoutlyst-rankings"
  );
  const sofifaHtmlCount = fsExists(sofifaDir)
    ? fsReaddir(sofifaDir).filter((name) => name.toLowerCase().endsWith(".html")).length
    : 0;

  console.log("NL post-match pipeline starting");
  console.log(`  Articles found: ${files.length} under ${NL_OPTA_RESULTS_DIR}`);
  console.log(
    `  Player-stats fixtures: ${playerSummary.fixtures.length} ` +
      `(MS ${playerSummary.htmlCounts.matchSummary} / OS ${playerSummary.htmlCounts.optaSummary} / MD ${playerSummary.htmlCounts.matchDetails})`
  );
  console.log(`  SoFIFA listing pages: ${sofifaHtmlCount} under nl-scoutlyst-rankings`);
  if (playerSummary.unparsed.length) {
    console.warn(
      `  WARNING: ${playerSummary.unparsed.length} player-stats HTML file(s) failed filename parse`
    );
  }

  step(1, totalSteps, "Bring in match reports (scores and team process stats)");
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

  step(2, totalSteps, "Bring in player overall ratings from saved listing pages");
  if (!sofifaHtmlCount) {
    console.log(
      "No SoFIFA HTML in nl-scoutlyst-rankings - skipping (empty-safe). Save listing pages or run npm run nl:fetch-sofifa."
    );
  } else {
    run("npm", ["run", "nl:import-sofifa", "--", "--skip-report"]);
  }

  step(3, totalSteps, "Bring in player match statistics (goals, assists, shots on target)");
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

  step(4, totalSteps, "Update every nation's strength ratings from the new results");
  run("npm", ["run", "nl:recompute-ratings"]);

  step(
    5,
    totalSteps,
    "Refresh upcoming match odds and player odds (only before kickoff)"
  );
  const fill = await fillNlLeaguePhasePredictions();
  console.log(
    `  New upcoming lines: ${fill.predicted}. Updated before kickoff: ${fill.refreshed}. Already started and left frozen: ${fill.frozen}. Could not price: ${fill.skipped}.`
  );
  const payload = await refreshNationsLeagueHubSnapshot({ skipFill: true });
  if (!payload) {
    console.error("Could not refresh the Nations League hub (check database connection).");
    process.exit(1);
  }
  console.log(
    `  Hub now shows ${payload.recent.length} recent and ${payload.upcoming.length} upcoming matches.`
  );

  step(
    6,
    totalSteps,
    "Score finished match odds (home / draw / away, scorelines, over-under, both teams to score, handicaps)"
  );
  run("npx", ["tsx", "scripts/nl-evaluate-predictions.ts"]);

  step(
    7,
    totalSteps,
    "Score finished side markets (over-under, both teams to score, scorelines, handicaps)"
  );
  run("npx", ["tsx", "scripts/nl-evaluate-market-models.ts"]);

  step(
    8,
    totalSteps,
    "Score finished player markets (anytime goal, anytime assist, goal or assist, shots on target)"
  );
  run("npx", ["tsx", "scripts/nl-evaluate-player-props.ts"]);

  step(9, totalSteps, "Retune the main match model from those results");
  run("npx", ["tsx", "scripts/nl-calibrate-graham.ts"]);

  step(10, totalSteps, "Retune side-market settings from those results");
  run("npx", ["tsx", "scripts/nl-calibrate-market-models.ts"]);

  step(
    11,
    totalSteps,
    "Retune player-market settings (anytime goal, anytime assist, goal or assist, shots on target)"
  );
  run("npx", ["tsx", "scripts/nl-calibrate-player-props.ts"]);

  step(12, totalSteps, "Machine-learning check, hub republish, and plain-language summary");
  run("npx", ["tsx", "scripts/nl-ml-backfill-training-examples.ts"]);
  run("npx", ["tsx", "scripts/nl-ml-train.ts"]);
  const refreshed = await refreshNationsLeagueHubSnapshot({ skipFill: true });
  if (refreshed) {
    console.log(
      `  Hub republished with ${refreshed.upcoming.length} upcoming match(es).`
    );
  }

  writeRunFacts({
    articlesIngested: files.length,
    playerStatsIngested: playerSummary.fixtures.length,
    playerStatsSkipped: 0,
    scoresMarkedFinished: playerSummary.fixtures.length,
    nationsRated: 54,
    locksNew: fill.predicted,
    locksRefreshed: fill.refreshed,
    locksFrozen: fill.frozen,
    matchEvals: 0,
    playerLines: 0,
  });
  run("npx", ["tsx", "scripts/nl-post-match-report.ts"]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
