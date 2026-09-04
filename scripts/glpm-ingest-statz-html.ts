/**
 * Ingest saved Statz.ai team HTML (Complete) into glpm_match_team_stats.
 * Writes corners / yellows / reds / fouls for 2025/26 Premier League only.
 * Archives every parsed match (including 2026/27 and cups) as JSON.
 *
 * Usage:
 *   npx tsx scripts/glpm-ingest-statz-html.ts --dir ~/Downloads/PL2526SeasonStats
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectRowsFromPages,
  parseStatzTeamPage,
  type StatzTeamMatchRow,
  type StatzTeamPage,
} from "../src/lib/glpm-cx/satellites/statz-html";
import { tryCreateServiceClient } from "../src/lib/supabase";

const PL_2526_SEASON_ID = 25583;
const SPURS_EVERTON_MATCH_ID = 19427244;

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

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function compactFixture(fx: StatzTeamPage["fixtures"][number]) {
  const info = fx.info ?? ({} as StatzTeamPage["fixtures"][number]["info"]);
  return {
    info: {
      id: info.id,
      name: info.name,
      current_team_id: info.current_team_id,
      home_team_id: info.home_team_id,
      away_team_id: info.away_team_id,
      home_team_name: info.home_team_name,
      away_team_name: info.away_team_name,
      home_team_goals: info.home_team_goals,
      away_team_goals: info.away_team_goals,
      formatted_kickoff_datetime: info.formatted_kickoff_datetime,
      season_name: info.season_name,
      competition_id: info.competition_id,
      competition_name: info.competition_name,
    },
    selected_team_stats: fx.selected_team_stats ?? {},
    opposition_stats: fx.opposition_stats ?? {},
  };
}

function eventPatch(row: StatzTeamMatchRow) {
  const patch: {
    corners?: number;
    yellow_cards?: number;
    red_cards?: number;
    fouls?: number;
  } = {};
  if (row.corners != null) patch.corners = row.corners;
  if (row.yellowCards != null) patch.yellow_cards = row.yellowCards;
  if (row.redCards != null) patch.red_cards = row.redCards;
  if (row.fouls != null) patch.fouls = row.fouls;
  return patch;
}

async function main() {
  loadEnvLocal();
  const dir = expandHome(
    argValue("--dir") ?? path.join(os.homedir(), "Downloads", "PL2526SeasonStats")
  );
  if (!fs.existsSync(dir)) {
    console.error(`Folder not found: ${dir}`);
    process.exit(1);
  }

  const htmlFiles = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".html") && !n.includes("_files"))
    .map((n) => path.join(dir, n));

  const pages: StatzTeamPage[] = [];
  const skipped: string[] = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const page = parseStatzTeamPage(html);
    if (!page) {
      skipped.push(path.basename(file));
      continue;
    }
    pages.push(page);
    console.log(
      `Parsed ${page.teamName} (${page.fixtures.length} fixtures, limit=${page.fixtureLimit ?? "?"}) from ${path.basename(file)}`
    );
  }

  const { all, pl2526 } = collectRowsFromPages(pages);
  const roster = new Map<number, string>();
  for (const page of pages) {
    for (const t of page.premierLeagueTeams ?? []) roster.set(t.id, t.name);
  }
  const parsedIds = new Set(pages.map((p) => p.teamId));
  const missingClubs = [...roster.entries()]
    .filter(([id]) => !parsedIds.has(id))
    .map(([id, name]) => `${name} (${id})`);

  const archiveDir = path.join(process.cwd(), "data", "imports", "statz");
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, "pl-team-form-parsed.json");
  fs.writeFileSync(
    archivePath,
    JSON.stringify(
      {
        source: "statz.ai saved HTML",
        importedAt: new Date().toISOString(),
        sourceDir: dir,
        fixtureLimit: pages[0]?.fixtureLimit ?? null,
        teams: pages.map((p) => ({
          teamId: p.teamId,
          teamName: p.teamName,
          fixtureCount: p.fixtures.length,
          fixtureLimit: p.fixtureLimit ?? null,
          teamSummary: p.teamSummary ?? null,
          fixtures: p.fixtures.map(compactFixture),
        })),
        premierLeagueTeams: [...roster.entries()].map(([id, name]) => ({ id, name })),
        missingClubPages: missingClubs,
        skippedFiles: skipped,
        rows: all,
      },
      null,
      2
    )
  );
  const uniquePlMatches = new Set(pl2526.map((r) => r.matchSmId));
  console.log(`\nArchived ${all.length} team-match row(s) -> ${archivePath}`);
  console.log(
    `2025/26 Premier League: ${pl2526.length} team-rows across ${uniquePlMatches.size} unique matches`
  );
  if (missingClubs.length) {
    console.log(`Missing 26/27 club pages: ${missingClubs.join(", ")}`);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const matchIds = [...uniquePlMatches];
  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id,season_id")
    .in("sm_id", matchIds);
  if (matchErr) throw new Error(matchErr.message);
  const known = new Map((matches ?? []).map((m) => [m.sm_id, m.season_id] as const));

  let updated = 0;
  let missingMatch = 0;
  let missingRow = 0;
  let wrongSeason = 0;
  let emptyPatch = 0;

  for (const row of pl2526) {
    const seasonId = known.get(row.matchSmId);
    if (seasonId == null) {
      missingMatch += 1;
      continue;
    }
    if (seasonId !== PL_2526_SEASON_ID) {
      wrongSeason += 1;
      continue;
    }

    const patch = eventPatch(row);
    if (Object.keys(patch).length === 0) {
      emptyPatch += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("glpm_match_team_stats")
      .update(patch)
      .eq("match_sm_id", row.matchSmId)
      .eq("team_sm_id", row.teamSmId)
      .select("match_sm_id");
    if (error) throw new Error(error.message);
    if (!data?.length) missingRow += 1;
    else updated += 1;
  }

  const evertonSpurs = pl2526.filter((r) => r.matchSmId === SPURS_EVERTON_MATCH_ID);
  console.log("\n=== Tottenham vs Everton 24 May 2026 (25/26) from Statz ===");
  for (const r of evertonSpurs.sort((a, b) => a.teamSmId - b.teamSmId)) {
    const side = r.teamSmId === 6 ? "Tottenham" : r.teamSmId === 13 ? "Everton" : `team ${r.teamSmId}`;
    console.log(
      `  ${side}: corners=${r.corners} yellows=${r.yellowCards} reds=${r.redCards} fouls=${r.fouls}`
    );
  }

  const { data: dbCheck, error: dbErr } = await supabase
    .from("glpm_match_team_stats")
    .select("team_sm_id,corners,yellow_cards,red_cards,fouls")
    .eq("match_sm_id", SPURS_EVERTON_MATCH_ID)
    .in("team_sm_id", [6, 13]);
  if (dbErr) throw new Error(dbErr.message);
  console.log("=== Same match after DB write ===");
  for (const r of (dbCheck ?? []).sort((a, b) => a.team_sm_id - b.team_sm_id)) {
    const side = r.team_sm_id === 6 ? "Tottenham" : r.team_sm_id === 13 ? "Everton" : `team ${r.team_sm_id}`;
    console.log(
      `  ${side}: corners=${r.corners} yellows=${r.yellow_cards} reds=${r.red_cards} fouls=${r.fouls}`
    );
  }

  console.log("\nDone.");
  console.log(`  teams parsed: ${pages.length}`);
  console.log(`  files skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(", ")})` : ""}`);
  console.log(`  PL 25/26 rows updated: ${updated}`);
  console.log(`  missing glpm_matches: ${missingMatch}`);
  console.log(`  missing team-stat rows: ${missingRow}`);
  console.log(`  skipped wrong season_id: ${wrongSeason}`);
  console.log(`  skipped empty event patch: ${emptyPatch}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
