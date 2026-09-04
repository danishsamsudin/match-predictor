/**
 * Import corners / cards / fouls into glpm_match_team_stats from a
 * football-data.co.uk (or compatible) CSV. Does not call SportMonks.
 *
 * Usage:
 *   npx tsx scripts/glpm-import-event-stats-csv.ts --season-id 25583 path/to/E0.csv
 *
 * Expected headers (football-data.co.uk):
 *   Date, HomeTeam, AwayTeam, HC, AC, HY, AY, HR, AR, HF, AF
 */
import fs from "node:fs";
import path from "node:path";
import {
  matchCsvRowsToFixtures,
  parseEventStatsCsv,
} from "../src/lib/glpm-cx/satellites/event-stats-csv";
import { tryCreateServiceClient } from "../src/lib/supabase";

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

async function main() {
  loadEnvLocal();
  const seasonArg = argValue("--season-id");
  const csvPath = process.argv.find((a, i) => i > 1 && !a.startsWith("--") && a !== seasonArg);
  if (!seasonArg || !csvPath) {
    console.error(
      "Usage: npx tsx scripts/glpm-import-event-stats-csv.ts --season-id <id> <file.csv>"
    );
    process.exit(1);
  }
  const seasonId = Number(seasonArg);
  if (!Number.isFinite(seasonId)) {
    console.error(`Invalid season id: ${seasonArg}`);
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const csvRows = parseEventStatsCsv(fs.readFileSync(csvPath, "utf8"));
  console.log(`Parsed ${csvRows.length} CSV row(s).`);

  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id,match_date,home_team_sm_id,away_team_sm_id")
    .eq("season_id", seasonId)
    .limit(800);
  if (matchErr) throw new Error(matchErr.message);

  const teamIds = new Set<number>();
  for (const m of matches ?? []) {
    teamIds.add(m.home_team_sm_id);
    teamIds.add(m.away_team_sm_id);
  }
  const { data: teams } = await supabase
    .from("glpm_teams")
    .select("sm_id,name")
    .in("sm_id", [...teamIds]);
  const nameById = new Map((teams ?? []).map((t) => [t.sm_id, t.name] as const));

  const fixtures = (matches ?? [])
    .filter((m) => m.match_date)
    .map((m) => ({
      matchSmId: m.sm_id,
      matchDate: String(m.match_date),
      homeTeamSmId: m.home_team_sm_id,
      awayTeamSmId: m.away_team_sm_id,
      homeName: nameById.get(m.home_team_sm_id) ?? "",
      awayName: nameById.get(m.away_team_sm_id) ?? "",
    }));

  const { patches, unmatched } = matchCsvRowsToFixtures(csvRows, fixtures);
  console.log(`Matched ${patches.length / 2} fixture(s). Unmatched CSV rows: ${unmatched.length}.`);
  if (unmatched.length) {
    for (const u of unmatched.slice(0, 12)) {
      console.log(`  unmatched ${u.dateIso} ${u.homeName} vs ${u.awayName}`);
    }
    if (unmatched.length > 12) console.log(`  … ${unmatched.length - 12} more`);
  }

  let updated = 0;
  let skipped = 0;
  for (const patch of patches) {
    const row = {
      corners: patch.corners,
      yellow_cards: patch.yellowCards,
      red_cards: patch.redCards,
      fouls: patch.fouls,
    };
    const { data, error } = await supabase
      .from("glpm_match_team_stats")
      .update(row)
      .eq("match_sm_id", patch.matchSmId)
      .eq("team_sm_id", patch.teamSmId)
      .select("match_sm_id");
    if (error) throw new Error(error.message);
    if (!data?.length) skipped += 1;
    else updated += 1;
  }

  console.log(`Updated ${updated} team-stat row(s). Skipped (no existing row): ${skipped}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
