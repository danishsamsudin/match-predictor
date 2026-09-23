/**
 * Backfill NL 2026/27 matches with CEST kickoff + venue from
 * data/nations-league-2026/fixture-venues.json (Sofascore).
 * Missing cities fall back to the home nation's base city.
 *
 * Usage: npx tsx scripts/nl-seed-fixture-venues.ts [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { getNationalTeamBaseCity } from "../src/lib/data/national-team-geography";
import { NL_COMPETITION_LABEL } from "../src/lib/nations-league/group-draw";
import { tryCreateServiceClient } from "../src/lib/supabase";

type VenueRow = {
  sofascore_event_id?: number;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  date_cest: string;
  time_cest: string | null;
  kickoff_utc?: string | null;
  venue: string | null;
  venue_city: string | null;
  round?: string | null;
};

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

function pairKey(date: string, homeId: string, awayId: string): string {
  return `${date}|${homeId}|${awayId}`;
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const filePath = path.join(
    process.cwd(),
    "data/nations-league-2026/fixture-venues.json"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    fixtures: VenueRow[];
  };

  const byPair = new Map<string, VenueRow>();
  for (const fx of payload.fixtures ?? []) {
    byPair.set(
      pairKey(fx.date_cest, String(fx.home_team_id), String(fx.away_team_id)),
      fx
    );
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data: rows, error } = await supabase
    .from("matches")
    .select("id, date, time, home_team_id, away_team_id, venue, venue_city")
    .ilike("competition", "%Nations League%")
    .eq("status", "scheduled");
  if (error) throw error;

  let updated = 0;
  let missing = 0;
  for (const row of rows ?? []) {
    if (!row.date || !row.home_team_id || !row.away_team_id) continue;
    if (String(row.home_team_id).startsWith("nl-slot:")) continue;

    const fx = byPair.get(
      pairKey(row.date, String(row.home_team_id), String(row.away_team_id))
    );

    const homeIdNum = Number(row.home_team_id);
    const fallbackCity = Number.isFinite(homeIdNum)
      ? getNationalTeamBaseCity(homeIdNum)
      : null;

    const timeRaw = fx?.time_cest ?? row.time;
    const time =
      typeof timeRaw === "string" && /^\d{1,2}:\d{2}/.test(timeRaw)
        ? timeRaw.slice(0, 5)
        : timeRaw;
    const venue = fx?.venue ?? row.venue;
    const venueCity = fx?.venue_city ?? row.venue_city ?? fallbackCity;

    if (!fx) missing += 1;

    if (
      time === row.time &&
      venue === row.venue &&
      venueCity === row.venue_city
    ) {
      continue;
    }

    if (dryRun) {
      console.log(
        `would update ${row.id}: ${time} @ ${venue ?? "-"} / ${venueCity ?? "-"}`
      );
      updated += 1;
      continue;
    }

    const { error: upErr } = await supabase
      .from("matches")
      .update({
        time,
        venue,
        venue_city: venueCity,
      })
      .eq("id", row.id);
    if (upErr) throw upErr;
    updated += 1;
  }

  console.log(
    `${dryRun ? "Would update" : "Updated"} ${updated} matches (${NL_COMPETITION_LABEL}). Sofascore misses filled via home base city where needed. Unmatched rows: ${missing}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
