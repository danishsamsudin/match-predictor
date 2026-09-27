/**
 * Import Nations League SoFIFA player-listing HTML dumps into soccerdata_players,
 * then report NL squad players still missing a Sofifa overall.
 *
 * Usage:
 *   npx tsx scripts/import-nl-sofifa-players-local.ts
 *   npx tsx scripts/import-nl-sofifa-players-local.ts --dir "data/nations-league-2026/nl-scoutlyst-rankings"
 *   npx tsx scripts/import-nl-sofifa-players-local.ts --report-only
 */
import fs from "fs";
import path from "path";
import {
  importNlSofifaPlayersFromDir,
  listNlSofifaPlayersHtmlFiles,
  NL_SOFIFA_PLAYERS_DIR,
} from "../src/lib/nations-league/import-nl-sofifa-players";
import { buildNlSofifaCoverageReport } from "../src/lib/nations-league/nl-sofifa-coverage";
import { createServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(): { dir: string; reportOnly: boolean; skipReport: boolean } {
  const dirIdx = process.argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? process.argv[dirIdx + 1] : NL_SOFIFA_PLAYERS_DIR;
  return {
    dir: path.resolve(dir),
    reportOnly: process.argv.includes("--report-only"),
    skipReport: process.argv.includes("--skip-report"),
  };
}

function writeMissingReport(
  missing: Array<{
    teamName: string;
    playerName: string;
    position: string;
    performanceScore: number | null;
  }>,
  outPath: string
) {
  const lines = [
    "team,player,position,performance_score",
    ...missing.map(
      (row) =>
        `${JSON.stringify(row.teamName)},${JSON.stringify(row.playerName)},${JSON.stringify(row.position)},${row.performanceScore ?? ""}`
    ),
  ];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  loadEnvLocal();
  const { dir, reportOnly, skipReport } = parseArgs();
  const supabase = createServiceClient();

  if (!reportOnly) {
    const files = listNlSofifaPlayersHtmlFiles(dir);
    if (!files.length) {
      console.log(`No SoFIFA HTML in ${dir} - nothing to import.`);
    } else {
      console.log(`Importing ${files.length} SoFIFA listing page(s) from ${dir}`);
      const result = await importNlSofifaPlayersFromDir(supabase, dir);
      console.log(
        `Parsed ${result.parsedPlayers} players · inserted ${result.inserted} · updated ${result.updated}` +
          (result.skippedNoOverall ? ` · skipped ${result.skippedNoOverall} without overall` : "")
      );
    }
  }

  if (skipReport) return;

  console.log("\nBuilding NL squad ↔ Sofifa coverage report…");
  const report = await buildNlSofifaCoverageReport(supabase);
  const coveredPct =
    report.rosterPlayers > 0
      ? ((100 * report.withSofifa) / report.rosterPlayers).toFixed(1)
      : "0.0";

  console.log(
    `Teams ${report.teamsChecked} · roster players ${report.rosterPlayers} · with Sofifa ${report.withSofifa} (${coveredPct}%) · with perf score ${report.withPerformanceScore}`
  );
  if (report.emptyRosters.length) {
    console.log(
      `Empty rosters (${report.emptyRosters.length}): ${report.emptyRosters
        .map((t) => t.teamName)
        .join(", ")}`
    );
  }

  const outPath = path.join(
    process.cwd(),
    "data/nations-league-2026/nl-sofifa-missing-players.csv"
  );
  writeMissingReport(report.missingSofifa, outPath);

  if (!report.missingSofifa.length) {
    console.log("All loaded NL squad players have a Sofifa overall.");
    return;
  }

  console.log(
    `\nMissing Sofifa overall (${report.missingSofifa.length}) - also written to ${outPath}:\n`
  );
  let currentTeam = "";
  for (const row of report.missingSofifa) {
    if (row.teamName !== currentTeam) {
      currentTeam = row.teamName;
      console.log(`  ${currentTeam}`);
    }
    const perf =
      row.performanceScore != null && row.performanceScore > 0
        ? ` (perf ${row.performanceScore})`
        : " (no perf score)";
    console.log(`    - ${row.playerName} (${row.position})${perf}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
