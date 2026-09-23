/**
 * Seed UEFA Nations League 2026/27 fixtures into `matches`:
 * - All 156 league-phase fixtures (official UEFA list)
 * - Knockout / play-off / finals placeholders through June 2027 (+ C/D 2028)
 *
 * Also ensures `nations_league_groups` + `teams` rows exist (same as nl:seed-groups).
 *
 * Usage: npx tsx scripts/nl-seed-fixtures.ts [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import {
  findNationsLeagueTeamByName,
  NATIONS_LEAGUE_2026_TEAMS,
} from "../src/lib/data/nations-league-2026-teams";
import {
  buildNlTeamIdToGroupMap,
  leagueTierFromGroupCode,
  loadNlGroupDraw,
  NL_COMPETITION_LABEL,
} from "../src/lib/nations-league/group-draw";
import { tryCreateServiceClient } from "../src/lib/supabase";

type FixtureRow = {
  fixture_key: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  home_slot?: string;
  away_slot?: string;
  round: string;
  phase: string;
  matchday?: number;
  placeholder?: boolean;
  tie_code?: string;
  leg?: number;
};

type FixturesFile = {
  leaguePhase: FixtureRow[];
  knockout: FixtureRow[];
};

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

function slugSlot(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function resolveTeamId(name: string): { id: string; name: string; placeholder: boolean } {
  const team = findNationsLeagueTeamByName(name);
  if (team) return { id: String(team.id), name: team.name, placeholder: false };
  // Soft aliases from UEFA copy
  const aliases: Record<string, string> = {
    "bosnia and herzegovina": "Bosnia & Herzegovina",
    turkey: "Türkiye",
    turkiye: "Türkiye",
  };
  const aliased = aliases[name.trim().toLowerCase()];
  if (aliased) {
    const t2 = findNationsLeagueTeamByName(aliased);
    if (t2) return { id: String(t2.id), name: t2.name, placeholder: false };
  }
  return {
    id: `nl-slot:${slugSlot(name)}`,
    name,
    placeholder: true,
  };
}

function matchIdFor(fx: FixtureRow, homeId: string, awayId: string): string {
  if (fx.placeholder || fx.fixture_key.startsWith("nl-qf") || fx.fixture_key.startsWith("nl-po") || fx.fixture_key.startsWith("nl-finals")) {
    return fx.fixture_key;
  }
  return `nl-2026-${fx.date}-${homeId}-${awayId}`;
}

async function seedGroups(
  supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>
) {
  const draw = loadNlGroupDraw();
  const rows: Array<{
    league_tier: string;
    group_code: string;
    team_id: string;
    sort_order: number;
  }> = [];

  for (const [groupCode, names] of Object.entries(draw)) {
    const tier = leagueTierFromGroupCode(groupCode);
    if (!tier) continue;
    names.forEach((name, idx) => {
      const team = findNationsLeagueTeamByName(name);
      if (!team) {
        console.warn("Unknown team in draw:", name);
        return;
      }
      rows.push({
        league_tier: tier,
        group_code: groupCode,
        team_id: String(team.id),
        sort_order: idx,
      });
    });
  }

  const { error } = await supabase.from("nations_league_groups").upsert(rows);
  if (error) throw error;
  return rows.length;
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const fixturesPath = path.join(process.cwd(), "data/nations-league-2026/fixtures.json");
  if (!fs.existsSync(fixturesPath)) {
    throw new Error(`Missing ${fixturesPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as FixturesFile;
  const allFx = [...(payload.leaguePhase ?? []), ...(payload.knockout ?? [])];

  const teamToGroup = buildNlTeamIdToGroupMap();
  const teamUpserts = new Map<string, { id: string; name: string }>();
  for (const t of NATIONS_LEAGUE_2026_TEAMS) {
    teamUpserts.set(String(t.id), { id: String(t.id), name: t.name });
  }

  const matchRows: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];

  for (const fx of allFx) {
    const home = resolveTeamId(fx.home_slot ?? fx.home);
    const away = resolveTeamId(fx.away_slot ?? fx.away);
    teamUpserts.set(home.id, { id: home.id, name: home.name });
    teamUpserts.set(away.id, { id: away.id, name: away.name });

    const homeNum = Number(home.id);
    const awayNum = Number(away.id);
    let groupCode: string | null = null;
    if (Number.isFinite(homeNum) && Number.isFinite(awayNum) && !home.placeholder && !away.placeholder) {
      const gH = teamToGroup.get(homeNum);
      const gA = teamToGroup.get(awayNum);
      if (gH && gA && gH === gA) groupCode = gH;
    }

    matchRows.push({
      id: matchIdFor(fx, home.id, away.id),
      date: fx.date,
      time: fx.time,
      competition: NL_COMPETITION_LABEL,
      round: fx.round,
      group_code: groupCode,
      status: "scheduled",
      home_team_id: home.id,
      away_team_id: away.id,
      home_goals: null,
      away_goals: null,
      venue: null,
      venue_city: null,
    });

    if (home.placeholder || away.placeholder) {
      warnings.push(`${fx.date} ${home.name} vs ${away.name} (placeholder slots)`);
    }
  }

  console.log(
    `Prepared ${matchRows.length} matches (${payload.leaguePhase?.length ?? 0} league, ${payload.knockout?.length ?? 0} knockout/playoff).`
  );
  if (dryRun) {
    console.log("Dry run - first 5:", matchRows.slice(0, 5));
    console.log(`Placeholder/knockout rows: ${warnings.length}`);
    return;
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const teams = [...teamUpserts.values()];
  const { error: teamErr } = await supabase.from("teams").upsert(teams);
  if (teamErr) throw teamErr;
  console.log(`Upserted ${teams.length} teams (incl. placeholder slots).`);

  const groupCount = await seedGroups(supabase);
  console.log(`Seeded ${groupCount} nations_league_groups rows.`);

  // Upsert in batches
  const batchSize = 50;
  let upserted = 0;
  for (let i = 0; i < matchRows.length; i += batchSize) {
    const batch = matchRows.slice(i, i + batchSize);
    const { error } = await supabase.from("matches").upsert(batch);
    if (error) throw error;
    upserted += batch.length;
  }
  console.log(`Upserted ${upserted} scheduled NL matches.`);
  if (warnings.length) {
    console.log(`Knockout/playoff placeholders: ${warnings.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
