import fs from "fs";
import path from "path";
import { buildPlayerDetailStats } from "../src/lib/data/player-stat-display";
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
  const nameFilter = process.argv[2] ?? "Zabarnyi";
  const teamId = process.argv[3] ? Number(process.argv[3]) : 35;

  const supabase = createServiceClient();
  let query = supabase
    .from("scoutlyst_player_snapshots")
    .select("player_name, stats, snapshot_date, reference_team_id, sofascore_player_id")
    .ilike("player_name", `%${nameFilter}%`)
    .order("snapshot_date", { ascending: false })
    .limit(5);

  if (teamId) query = query.eq("reference_team_id", teamId);

  const { data, error } = await query;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (!data?.length) {
    console.log("No rows for", nameFilter, "team", teamId);
    process.exit(0);
  }

  const row = data[0];
  const stats = (row.stats ?? {}) as Record<string, string | number | null>;
  console.log("Player:", row.player_name, "team", row.reference_team_id, "snapshot", row.snapshot_date);
  console.log("Sofascore id:", row.sofascore_player_id);
  console.log("\nRaw stat keys (" + Object.keys(stats).length + "):");
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("\nDisplay mapping:");
  for (const s of buildPlayerDetailStats(stats)) {
    console.log(`  ${s.label}: ${s.value}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
