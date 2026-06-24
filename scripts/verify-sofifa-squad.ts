import fs from "fs";
import path from "path";
import { readFileSync } from "fs";
import { extractSofifaStartingXi, parseSofifaSquadHtml } from "../src/lib/data/parse-sofifa-squad-html";
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
    const dbXi = rows
      .filter((r) => r.is_starter === true)
      .sort((a, b) => (a.squad_order ?? 999) - (b.squad_order ?? 999))
      .slice(0, 11)
      .map((r) => r.name);
    console.log(`DB Squad-table XI: ${dbXi.join(", ")}`);

    const htmlPath = path.join(
      process.cwd(),
      "data/world-cup-2026/WC Squads - SoFIFA",
      `${label} - FC 26 - Jun 10, 2026 _ SoFIFA.html`
    );
    if (fs.existsSync(htmlPath)) {
      const parsed = parseSofifaSquadHtml(readFileSync(htmlPath, "utf-8"), path.basename(htmlPath));
      const htmlXi = extractSofifaStartingXi(parsed.players).map((p) => p.fullName);
      console.log(`HTML Squad-table XI: ${htmlXi.join(", ")}`);
      const mismatch = dbXi.length !== htmlXi.length || dbXi.some((n, i) => n !== htmlXi[i]);
      if (mismatch) console.log("WARNING: DB XI does not match HTML Squad-table XI — re-run import-sofifa-squads-local");
    }
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
