/**
 * Parse formation columns from saved FBref squad HTML and update matches + team_formation_usage.
 * Usage: npx tsx scripts/backfill-fbref-match-formations.ts
 */
import fs from "fs";
import path from "path";
import { WORLD_CUP_2026_TEAMS, normalizeNationalTeamName } from "../src/lib/data/world-cup-2026-teams";
import { syncFbrefFormationsForTeamName } from "../src/lib/data/team-formations";
import { resolveFbrefTeamIdByName } from "../src/lib/fbref/comparison-fallback";
import { createServiceClient } from "../src/lib/supabase";

const IMPORT_DIR = path.join(process.cwd(), "data/imports/fbref/world-cup");
const MATCH_ID_RE = /\/matches\/([a-f0-9]+)\//i;

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

function cellValue(rowHtml: string, stat: string): string {
  const re = new RegExp(
    `data-stat="${stat}"[^>]*>(?:<a[^>]*>)?([^<]+)`,
    "i"
  );
  const m = rowHtml.match(re);
  return m?.[1]?.trim() ?? "";
}

function parseMatchlogFormations(html: string) {
  const tableMatch = html.match(/<table[^>]*id="matchlogs[^"]*"[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];

  const rows = tableMatch[0].match(/<tr[^>]*data-row[\s\S]*?<\/tr>/gi) ?? [];
  const updates: Array<{
    matchId: string;
    homeFormation: string | null;
    awayFormation: string | null;
  }> = [];

  for (const row of rows) {
    const hrefMatch = row.match(MATCH_ID_RE);
    if (!hrefMatch) continue;
    const venue = cellValue(row, "venue").toLowerCase();
    const formation = cellValue(row, "formation") || null;
    const oppFormation = cellValue(row, "opp_formation") || null;
    if (!formation && !oppFormation) continue;

    const isHome = venue === "home";
    const isAway = venue === "away";
    updates.push({
      matchId: hrefMatch[1],
      homeFormation: isHome ? formation : isAway ? oppFormation : formation,
      awayFormation: isHome ? oppFormation : isAway ? formation : oppFormation,
    });
  }
  return updates;
}

function countryFromFilename(filename: string): string | null {
  const match = filename.match(/^(.+?)\s+Men Stats/i);
  return match?.[1]?.trim() ?? null;
}

function resolveWcTeamName(raw: string): string | null {
  const key = normalizeNationalTeamName(raw);
  return WORLD_CUP_2026_TEAMS.find((t) => normalizeNationalTeamName(t.name) === key)?.name ?? null;
}

async function main() {
  loadEnvLocal();
  const supabase = createServiceClient();
  if (!fs.existsSync(IMPORT_DIR)) {
    console.error("Missing import dir:", IMPORT_DIR);
    process.exit(1);
  }

  let matchUpdates = 0;
  for (const file of fs.readdirSync(IMPORT_DIR)) {
    if (!file.endsWith(".html")) continue;
    const country = countryFromFilename(file);
    if (!country) continue;
    const teamName = resolveWcTeamName(country);
    if (!teamName) continue;

    const html = fs.readFileSync(path.join(IMPORT_DIR, file), "utf8");
    const rows = parseMatchlogFormations(html);
    for (const row of rows) {
      const { error } = await supabase
        .from("matches")
        .update({
          home_formation: row.homeFormation,
          away_formation: row.awayFormation,
        })
        .eq("id", row.matchId);
      if (!error) matchUpdates += 1;
    }
  }

  console.log(`Updated ${matchUpdates} match formation rows.`);

  for (const team of WORLD_CUP_2026_TEAMS) {
    const result = await syncFbrefFormationsForTeamName(supabase, team.name);
    if (result.preferredFormation) {
      console.log(`  ${team.name}: ${result.preferredFormation}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
