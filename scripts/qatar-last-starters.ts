import { tryCreateServiceClient } from "../src/lib/supabase";
import { projectWcModelXiFromLastStartersWithDetails } from "../src/lib/world-cup/resolve-wc-lineup-player-stats";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
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
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("no supabase");

  const last = await projectWcModelXiFromLastStartersWithDetails({
    supabase,
    teamApiId: 4792,
  });
  console.log("Last WC starters:", last.map((p) => p.name).join(", "));

  const { data: matches } = await supabase
    .from("matches")
    .select("id, date, home_team_id, away_team_id")
    .eq("date", "2026-06-18")
    .or("competition.ilike.%World Cup%");

  const canadaQatar = (matches ?? []).find((m) => {
    const ids = [m.home_team_id, m.away_team_id].join(",");
    return ids.includes("9c6d90a0") && ids.includes("9b696ed1");
  });
  console.log("Canada vs Qatar match id:", canadaQatar?.id);

  if (canadaQatar) {
    const { data: stats } = await supabase
      .from("world_cup_player_match_stats")
      .select("player_name, stats")
      .eq("team_api_id", 4792)
      .eq("match_id", canadaQatar.id)
      .order("player_name");
    for (const row of stats ?? []) {
      const s = row.stats as Record<string, unknown>;
      const mins = s.minutes_played ?? s.mins_played ?? s.minutes ?? "?";
      const starter = s.is_starter ?? s.starter ?? s.substitute === false;
      const r = Number(s.cards_red ?? 0);
      const y = Number(s.cards_yellow ?? 0);
      if (r || y || starter === true || mins === 90 || mins === "90")
        console.log(`  ${row.player_name}: mins=${mins} starter=${starter} Y=${y} R=${r}`);
    }
  }
}

main();
