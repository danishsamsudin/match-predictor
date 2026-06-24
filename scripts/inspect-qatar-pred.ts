import { tryCreateServiceClient } from "../src/lib/supabase";

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

async function inspect(matchId: string) {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("No supabase");
  const { data } = await supabase
    .from("world_cup_predictions")
    .select("snapshot, home_win_pct, away_win_pct, draw_pct, computed_at")
    .eq("match_id", matchId)
    .maybeSingle();
  if (!data) {
    console.log(`No prediction for ${matchId}`);
    return;
  }
  const snap = data.snapshot as Record<string, unknown>;
  const opta = (snap.opta_features ?? {}) as Record<string, unknown>;
  console.log(`\n=== ${matchId.slice(0, 8)} ===`);
  console.log("computed_at", data.computed_at);
  console.log(
    "1X2",
    `${(Number(data.home_win_pct) * 100).toFixed(1)}%`,
    `${(Number(data.draw_pct) * 100).toFixed(1)}%`,
    `${(Number(data.away_win_pct) * 100).toFixed(1)}%`
  );
  console.log("base xG", snap.base_home_xg ?? "n/a", snap.base_away_xg ?? "n/a");
  console.log("adjusted xG", snap.home_xg, snap.away_xg);
  console.log("lineup mults", snap.lineup_home_xg_mult, snap.lineup_away_xg_mult);
  console.log("lineup impact", opta.lineup_impact_home, opta.lineup_impact_away);
  console.log("suspended", opta.home_suspended_players, opta.away_suspended_players);
  console.log("model xi", opta.model_xi_source_home, opta.model_xi_source_away);
}

async function main() {
  loadEnvLocal();
  await inspect("a7dd033a-2472-55a1-9a1c-9227d6b78253");
  await inspect("d0a7d166-0011-59cd-a0d6-b5e5fea5656e");
}

main();
