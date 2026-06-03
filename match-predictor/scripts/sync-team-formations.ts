/**
 * Backfill team_formation_usage from FBref matches (home_formation / away_formation).
 * Run after import_fbref_world_cup_local.py and migration 014.
 *
 * Usage: npx tsx scripts/sync-team-formations.ts
 */
import fs from "fs";
import path from "path";
import { WORLD_CUP_2026_TEAMS } from "../src/lib/data/world-cup-2026-teams";
import { syncFbrefFormationsForTeamName } from "../src/lib/data/team-formations";
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

async function main() {
  loadEnvLocal();
  const supabase = createServiceClient();

  console.log(`Syncing formations for ${WORLD_CUP_2026_TEAMS.length} World Cup teams...`);
  let withFormation = 0;

  for (const team of WORLD_CUP_2026_TEAMS) {
    const result = await syncFbrefFormationsForTeamName(supabase, team.name);
    if (result.preferredFormation) {
      withFormation += 1;
      console.log(
        `  ${team.name}: ${result.preferredFormation} (${result.usage.map((u) => `${u.formation}×${u.match_count}`).join(", ")})`
      );
    } else {
      console.log(`  ${team.name}: no formation data`);
    }
  }

  console.log(`Done. ${withFormation}/${WORLD_CUP_2026_TEAMS.length} teams have a preferred formation.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
