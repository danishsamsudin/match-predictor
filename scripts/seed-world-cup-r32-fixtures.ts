/**
 * Seed Round of 32 fixtures into Supabase `matches` for hub predictions.
 *
 * Usage: npx tsx scripts/seed-world-cup-r32-fixtures.ts [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeNationalTeamName } from "../src/lib/data/world-cup-2026-teams";
import {
  buildR32HubMatchRows,
  isKnockoutSlotPlaceholder,
  loadR32Fixtures,
  r32FixtureHasBothTeams,
  r32MatchId,
} from "../src/lib/world-cup/r32-hub-fixtures";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    console.error("Missing Supabase service client (SUPABASE_SERVICE_ROLE_KEY in .env.local)");
    process.exit(1);
  }

  const { data: teams, error: teamsErr } = await supabase.from("teams").select("id, name");
  if (teamsErr) {
    console.error(teamsErr.message);
    process.exit(1);
  }

  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const nameToId = new Map<string, string>();
  for (const [id, name] of teamNames) {
    nameToId.set(normalizeNationalTeamName(name), id);
  }

  const rows = buildR32HubMatchRows(teamNames);
  let upserted = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const fx of loadR32Fixtures()) {
    const row = rows.find((m) => m.id === r32MatchId(fx.match_number));
    if (!row) continue;

    if (!r32FixtureHasBothTeams(fx)) {
      skipped += 1;
      warnings.push(
        `#${fx.match_number} ${fx.home_team} vs ${fx.away_team} — skipped (slot placeholder)`
      );
      continue;
    }

    if (!row.home_team_id || !row.away_team_id) {
      skipped += 1;
      warnings.push(
        `#${fx.match_number} ${fx.home_team} vs ${fx.away_team} — team id not found in Supabase`
      );
      continue;
    }

    if (isKnockoutSlotPlaceholder(row.home_team_id) || isKnockoutSlotPlaceholder(row.away_team_id)) {
      skipped += 1;
      continue;
    }

    const payload = {
      id: row.id,
      date: row.date,
      time: row.time,
      competition: row.competition,
      round: row.round,
      group_code: null,
      status: "scheduled",
      home_team_id: row.home_team_id,
      away_team_id: row.away_team_id,
      home_goals: null,
      away_goals: null,
      venue: row.venue,
      venue_city: row.venue_city,
      venue_altitude_meters: row.venue_altitude_meters ?? null,
    };

    if (dryRun) {
      console.log(
        `[dry-run] ${payload.id} ${payload.date} ${fx.home_team} vs ${fx.away_team} @ ${payload.venue_city}`
      );
      upserted += 1;
      continue;
    }

    const { error } = await supabase.from("matches").upsert(payload, { onConflict: "id" });
    if (error) {
      warnings.push(`${payload.id}: ${error.message}`);
      continue;
    }
    upserted += 1;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Upserted ${upserted} R32 fixtures, skipped ${skipped} with placeholders`
  );
  for (const line of warnings.slice(0, 12)) console.warn(`  ${line}`);
  if (warnings.length > 12) console.warn(`  … and ${warnings.length - 12} more`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
