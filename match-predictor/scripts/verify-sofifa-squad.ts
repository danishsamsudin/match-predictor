import fs from "fs";
import path from "path";
import { loadSofifaWcSquadForComparison } from "../src/lib/data/load-sofifa-wc-squad-for-comparison";
import { loadSofifaPlayersForTeam } from "../src/lib/data/load-sofifa-wc-squad-for-comparison";
import { sofifaOverallToScore } from "../src/lib/data/compute-player-performance-score";
import { applyBenchmarkToPerformanceScore } from "../src/lib/prediction/team-strength";
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
  const teams: Array<[number, string]> = [
    [4748, "Brazil"],
    [4778, "Morocco"],
  ];

  for (const [teamId, label] of teams) {
    const squad = await loadSofifaWcSquadForComparison(supabase, teamId, label, {
      teamName: label,
      entityType: "national",
    });
    if (!squad) {
      console.log(`--- ${label}: no squad ---`);
      continue;
    }

    const roster = [...squad.starters, ...squad.substitutes];

    console.log(`--- ${label} (${squad.squadSource}) formation ${squad.preferredFormation} ---`);
    for (const [i, player] of squad.starters.entries()) {
      console.log(
        `${i + 1}. ${player.name} (${player.position}) score=${Math.round(player.performanceScore)}`
      );
    }

    const names = roster.map((p) => p.name);
    const dup = names.filter((name, idx) => names.indexOf(name) !== idx);
    const fwds = squad.starters.filter((p) => p.position === "FWD").length;
    console.log(`roster=${roster.length} duplicates=${[...new Set(dup)].join(", ") || "none"} FWD starters=${fwds}`);

    const rows = await loadSofifaPlayersForTeam(supabase, teamId);
    const vini = rows.find((row) => row.name.includes("Vini"));
    if (vini) {
      const raw = sofifaOverallToScore(Number(vini.sofifa_overall));
      const bench = applyBenchmarkToPerformanceScore(raw, {
        entityType: "national",
        teamId,
        teamName: label,
        leagueId: 1,
      });
      console.log(
        `sample ${vini.name}: db overall=${vini.sofifa_overall} raw=${raw} benchmark=${bench}`
      );
    }
    console.log(`db rows=${rows.length} starters=${rows.filter((r) => r.is_starter).length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
