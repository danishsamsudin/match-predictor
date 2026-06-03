import fs from "fs";
import path from "path";
import {
  loadFbrefTeamSquadSnapshot,
  resolveFbrefTeamIdByName,
} from "../src/lib/fbref/comparison-fallback";
import { listFbrefPlayerStatsForTeam } from "../src/lib/fbref/supabase-store";
import { computePlayerPerformanceScore } from "../src/lib/data/compute-player-performance-score";

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
  for (const name of ["Brazil", "Netherlands"]) {
    const team = await resolveFbrefTeamIdByName(name);
    if (!team) {
      console.log(name, "no fbref team");
      continue;
    }
    const stats = await listFbrefPlayerStatsForTeam(team.id);
    const std = stats.find((s) => s.stat_type === "standard");
    if (std) {
      console.log("\n", name, "standard stat keys:", Object.keys(std.stats ?? {}).join(" | "));
    }
    const squad = await loadFbrefTeamSquadSnapshot(name, 4748);
    if (!squad) continue;
    const nonZero = squad.starters.filter((p) => (p.performanceScore ?? 0) > 0);
    console.log(
      "nonzero starters:",
      nonZero.map((p) => `${p.name}=${p.performanceScore}`).join(", ") || "none"
    );
    const zero = squad.starters.find((p) => (p.performanceScore ?? 0) === 0);
    if (zero) {
      const mins = zero.detailStats.find((d) => d.label === "Minutes")?.value;
      const apps = zero.detailStats.find((d) => d.label === "Appearances")?.value;
      console.log("sample zero:", zero.name, "mins", mins, "apps", apps, "pos", zero.position);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
