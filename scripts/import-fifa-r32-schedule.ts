/**
 * Import Round of 32 fixtures from a saved FIFA "Game Schedule & Where to Watch" HTML page.
 *
 * Usage:
 *   npx tsx scripts/import-fifa-r32-schedule.ts [path-to-html] [--dry-run] [--seed]
 *
 * Default HTML path:
 *   ~/Downloads/Game Schedule & Where to Watch _ FIFA World Cup 2026™.html
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseFifaWtwR32ScheduleHtml,
  type FifaKnockoutScheduleFallback,
} from "../src/lib/world-cup/parse-fifa-wtw-schedule-html";

const DEFAULT_HTML = path.join(
  os.homedir(),
  "Downloads",
  "Game Schedule & Where to Watch _ FIFA World Cup 2026™.html"
);

const OUT_PATH = path.join(process.cwd(), "data/world-cup-2026/r32-fixtures.json");
const BRACKET_PATH = path.join(process.cwd(), "data/world-cup-2026/knockout-bracket.json");

function loadBracketFallbacks(round: "R32" | "R16"): FifaKnockoutScheduleFallback[] {
  const raw = JSON.parse(fs.readFileSync(BRACKET_PATH, "utf8")) as {
    matches?: Array<{
      match_number: number;
      round: string;
      date: string;
      kickoff_time: string;
      stadium: string;
      city: string;
    }>;
  };
  return (raw.matches ?? [])
    .filter((m) => m.round === round)
    .map((m) => ({
      match_number: m.match_number,
      date: m.date,
      kickoff_time: m.kickoff_time,
      stadium: m.stadium,
      city: m.city,
    }));
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const htmlPath = args[0] ?? DEFAULT_HTML;

  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML file not found: ${htmlPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const fixtures = parseFifaWtwR32ScheduleHtml(html, loadBracketFallbacks("R32"));

  if (fixtures.length !== 16) {
    console.error(`Expected 16 Round of 32 fixtures, parsed ${fixtures.length}`);
    process.exit(1);
  }

  const payload = {
    version: "r32-live-draw-v2",
    source: `FIFA Game Schedule & Where to Watch (imported ${new Date().toISOString().slice(0, 10)})`,
    source_html: path.basename(htmlPath),
    fixtures: fixtures.map(
      ({
        match_number,
        date,
        kickoff_time,
        stadium,
        city,
        venue_raw,
        home_team,
        away_team,
        fifa_match_id,
        cest_date,
        cest_time,
      }) => ({
        match_number,
        date,
        kickoff_time,
        stadium,
        city,
        venue_raw,
        home_team,
        away_team,
        fifa_match_id,
        cest_date,
        cest_time,
      })
    ),
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${fixtures.length} R32 fixtures to ${OUT_PATH}`);
  for (const fx of fixtures) {
    console.log(
      `  #${fx.match_number} ${fx.date} ${fx.kickoff_time} ${fx.home_team} vs ${fx.away_team} @ ${fx.city} (${fx.cest_time} CEST)`
    );
  }
}

main();
