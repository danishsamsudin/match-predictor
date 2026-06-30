import fs from "node:fs";
import path from "node:path";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { loadWorldCupHubPayload } from "../src/lib/world-cup/hub-load";

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

async function main() {
  const sb = tryCreateServiceClient();
  if (!sb) {
    console.error("No service client");
    process.exit(1);
  }

  const { data: snap } = await sb
    .from("world_cup_hub_snapshot")
    .select("computed_at, payload")
    .eq("id", "latest")
    .single();

  type Row = {
    id: string;
    home_team_name?: string;
    home_goals: number | null;
    away_goals: number | null;
    match_phase?: string;
  };

  const payload = snap?.payload as { upcoming?: Row[]; recent?: Row[] } | null;
  const r32up = (payload?.upcoming ?? []).filter((m) => m.id.startsWith("wc2026-ko-"));
  const r32rec = (payload?.recent ?? []).filter((m) => m.id.startsWith("wc2026-ko-"));

  console.log("SNAPSHOT computed_at:", snap?.computed_at);
  console.log("SNAPSHOT r32 upcoming:", r32up.length);
  for (const m of r32up) {
    console.log(
      " ",
      m.id,
      m.home_team_name,
      m.home_goals,
      m.away_goals,
      m.match_phase
    );
  }
  console.log("SNAPSHOT r32 recent:", r32rec.length);
  for (const m of r32rec) {
    console.log(" ", m.id, m.home_team_name, m.home_goals, m.away_goals);
  }

  const live = await loadWorldCupHubPayload();
  const liveUp = live?.upcoming.filter((m) => m.id.startsWith("wc2026-ko-")) ?? [];
  const liveRec = live?.recent.filter((m) => m.id.startsWith("wc2026-ko-")) ?? [];
  console.log("\nLIVE PAYLOAD r32 upcoming:", liveUp.length);
  for (const m of liveUp) {
    console.log(
      " ",
      m.id,
      m.home_team_name,
      m.home_goals,
      m.away_goals,
      m.match_phase,
      m.status
    );
  }
  console.log("LIVE PAYLOAD r32 recent:", liveRec.length);
  for (const m of liveRec) {
    console.log(" ", m.id, m.home_team_name, m.home_goals, m.away_goals);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
