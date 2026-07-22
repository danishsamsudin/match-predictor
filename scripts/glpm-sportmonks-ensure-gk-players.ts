/**
 * Ensure all GK players referenced in glpm_match_player_stats exist in glpm_players.
 * Safe to run before goalkeeper training after GK stat backfill.
 */
import fs from "node:fs";
import path from "node:path";
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

async function main() {
  loadEnvLocal();
  const seasonArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (!seasonArg) {
    console.error("Usage: npx tsx scripts/glpm-sportmonks-ensure-gk-players.ts <seasonId>");
    process.exit(1);
  }
  const seasonId = Number(seasonArg);

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data: matches } = await supabase
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId);
  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) {
    console.log("No matches for season.");
    return;
  }

  const { data: gkStats } = await supabase
    .from("glpm_match_player_stats")
    .select("player_sm_id, team_sm_id")
    .eq("is_goalkeeper", true)
    .in("match_sm_id", matchIds.slice(0, 500));

  const unique = new Map<number, number>();
  for (const row of gkStats ?? []) {
    unique.set(row.player_sm_id, row.team_sm_id);
  }

  const players = [...unique.entries()].map(([player_sm_id, team_sm_id]) => ({
    sm_id: player_sm_id,
    current_team_sm_id: team_sm_id,
    short_name: `Player ${player_sm_id}`,
    role_name: "Goalkeeper",
    synced_at: new Date().toISOString(),
  }));

  if (!players.length) {
    console.log("No GK player stats found.");
    return;
  }

  const { error } = await supabase.from("glpm_players").upsert(players, { onConflict: "sm_id" });
  if (error) throw new Error(error.message);
  console.log(`Ensured ${players.length} goalkeeper player(s) in glpm_players.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
