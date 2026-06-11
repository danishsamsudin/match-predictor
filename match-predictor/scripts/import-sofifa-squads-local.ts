/**
 * Import SoFIFA World Cup squad HTML snapshots into Supabase.
 *
 * Overwrites `soccerdata_players` + `soccerdata_player_links` for each WC 2026 nation.
 * Also writes `data/world-cup-2026/sofifa-squads.json` with full parsed payloads.
 *
 * Usage (from match-predictor/):
 *   npx tsx scripts/import-sofifa-squads-local.ts
 *   npx tsx scripts/import-sofifa-squads-local.ts --dir "data/world-cup-2026/WC Squads - SoFIFA"
 */
import fs from "fs";
import path from "path";
import {
  isWc2026SofifaSquadFilename,
  parseSofifaSquadHtml,
  resolveWc2026SofifaTeamLabel,
  WC_2026_TEAM_ID_BY_LABEL,
  type SofifaSquadImport,
} from "../src/lib/data/parse-sofifa-squad-html";
import { WORLD_CUP_REFERENCE_LEAGUE_ID } from "../src/lib/data/world-cup-2026-teams";
import { createServiceClient } from "../src/lib/supabase";

const DEFAULT_DIR = path.join(
  process.cwd(),
  "data/world-cup-2026/WC Squads - SoFIFA"
);
const JSON_OUT = path.join(process.cwd(), "data/world-cup-2026/sofifa-squads.json");

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

function parseArgs(): { dir: string } {
  const dirIdx = process.argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? process.argv[dirIdx + 1] : DEFAULT_DIR;
  return { dir: path.resolve(dir) };
}

function primaryPosition(positions: string[]): string | null {
  return positions[0] ?? null;
}

async function replaceTeamPlayers(
  teamId: number,
  squad: SofifaSquadImport,
  syncedAt: string
): Promise<number> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("soccerdata_players")
    .select("id")
    .eq("team_id", teamId);

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length) {
    await supabase
      .from("soccerdata_player_links")
      .delete()
      .in("player_id", existingIds);
    await supabase.from("soccerdata_players").delete().eq("team_id", teamId);
  }

  let upserted = 0;
  for (const player of squad.players) {
    const naturalPosition = primaryPosition(player.positions);
    const fieldPosition = player.isStarter
      ? player.squadRole ?? naturalPosition
      : "SUB";

    const { data: inserted, error } = await supabase
      .from("soccerdata_players")
      .insert({
        name: player.fullName,
        league_id: WORLD_CUP_REFERENCE_LEAGUE_ID,
        team_id: teamId,
        position: naturalPosition,
        country: player.nationality,
        sofifa_overall: player.overall,
        sofifa_potential: player.potential,
        is_starter: player.isStarter,
        field_position: fieldPosition,
        jersey_number: player.jerseyNumber,
        updated_at: syncedAt,
        created_at: syncedAt,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.warn(`  skip player ${player.fullName}: ${error?.message ?? "no row"}`);
      continue;
    }

    const { error: linkErr } = await supabase.from("soccerdata_player_links").upsert(
      {
        player_id: inserted.id,
        source: "SoFIFA",
        soccerdata_player_key: String(player.sofifaPlayerId),
        confidence: 1,
        notes: JSON.stringify({
          short_name: player.shortName,
          potential: player.potential,
          age: player.age,
          value_eur: player.valueEur,
          wage_eur: player.wageEur,
          total_stats: player.totalStats,
          positions: player.positions,
          squad_role: player.squadRole,
          jersey_number: player.jerseyNumber,
          contract_years: player.contractYears,
          is_starter: player.isStarter,
        }),
        updated_at: syncedAt,
        created_at: syncedAt,
      },
      { onConflict: "player_id,source" }
    );

    if (linkErr) {
      console.warn(`  link failed for ${player.fullName}: ${linkErr.message}`);
      continue;
    }
    upserted += 1;
  }

  return upserted;
}

async function main() {
  loadEnvLocal();
  const { dir } = parseArgs();

  if (!fs.existsSync(dir)) {
    console.error(`Import directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".html") && !name.includes("_files"))
    .sort();

  const squadsByTeam = new Map<string, { file: string; squad: SofifaSquadImport }>();
  const skipped: string[] = [];

  for (const file of files) {
    if (!isWc2026SofifaSquadFilename(file)) {
      skipped.push(`${file}: not a World Cup 2026 nation`);
      continue;
    }
    const teamLabel = resolveWc2026SofifaTeamLabel(file);
    if (!teamLabel) {
      skipped.push(`${file}: could not resolve team label`);
      continue;
    }
    const html = fs.readFileSync(path.join(dir, file), "utf-8");
    const squad = parseSofifaSquadHtml(html, file);
    if (!squad.players.length) {
      skipped.push(`${file}: no players parsed`);
      continue;
    }
    squadsByTeam.set(teamLabel, { file, squad });
  }

  const syncedAt = new Date().toISOString();
  let totalPlayers = 0;
  const jsonTeams: Record<string, unknown> = {};

  for (const [teamLabel, { file, squad }] of [...squadsByTeam.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const teamId = WC_2026_TEAM_ID_BY_LABEL[teamLabel];
    const count = await replaceTeamPlayers(teamId, squad, syncedAt);
    totalPlayers += count;
    jsonTeams[teamLabel] = {
      source_file: file,
      sofascore_team_id: teamId,
      ...squad,
    };
    console.log(
      `upserted ${count}/${squad.players.length} players for ${teamLabel} (team_id=${teamId}) from ${file}`
    );
  }

  const payload = {
    source: "SoFIFA FC 26",
    roster_version: "260037",
    imported_at: syncedAt,
    team_count: Object.keys(jsonTeams).length,
    teams: jsonTeams,
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  console.log(
    `\nDone. ${totalPlayers} player rows across ${Object.keys(jsonTeams).length} teams.`
  );
  console.log(`JSON snapshot: ${JSON_OUT}`);
  if (skipped.length) {
    console.log("\nSkipped files:");
    for (const line of skipped) console.log(`  - ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
