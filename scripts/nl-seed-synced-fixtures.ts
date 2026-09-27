/**
 * Upsert upcoming Nations League fixtures from fixture-venues.json into
 * synced_fixtures so the Predict picker is not limited to SportAPI "next".
 *
 *   npx tsx scripts/nl-seed-synced-fixtures.ts
 *   npx tsx scripts/nl-seed-synced-fixtures.ts --dry-run
 */
import fs from "fs";
import path from "path";
import fixtureVenueSchedule from "../data/nations-league-2026/fixture-venues.json";
import {
  NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
} from "../src/lib/data/nations-league-2026-teams";
import { tryCreateServiceClient } from "../src/lib/supabase";

type NlVenueFixture = {
  sofascore_event_id: number;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  kickoff_utc: string;
  venue_city: string | null;
};

const NL_LEAGUE_NAME = "UEFA Nations League";
const NL_SEASON = 2026;

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

function startOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = startOfTodayUtcIso();
  const rows = (fixtureVenueSchedule as { fixtures: NlVenueFixture[] }).fixtures
    .filter(
      (f) =>
        Number.isFinite(f.sofascore_event_id) &&
        f.kickoff_utc &&
        f.kickoff_utc >= cutoff
    )
    .map((f) => ({
      event_id: f.sofascore_event_id,
      league_id: NATIONS_LEAGUE_REFERENCE_LEAGUE_ID,
      league_name: NL_LEAGUE_NAME,
      season: NL_SEASON,
      kickoff_at: f.kickoff_utc,
      venue_city: (f.venue_city ?? "").trim() || null,
      home_team_id: f.home_team_id,
      home_team_name: f.home,
      away_team_id: f.away_team_id,
      away_team_name: f.away,
      synced_at: new Date().toISOString(),
    }));

  console.log(`Upcoming NL fixtures to upsert: ${rows.length}`);
  if (dryRun) {
    console.log(
      "Sample:",
      rows.slice(0, 5).map((r) => `${r.kickoff_at} ${r.home_team_name} vs ${r.away_team_name}`)
    );
    return;
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const chunkSize = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("synced_fixtures").upsert(chunk, {
      onConflict: "event_id",
    });
    if (error) throw error;
    upserted += chunk.length;
    console.log(`Upserted ${upserted}/${rows.length}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
