/**
 * Backfill FIFA World Cup 2026 matches with canonical stadium + host city
 * from data/world-cup-2026/fixture-venues.json (FBref schedule).
 *
 * Usage: npx tsx scripts/seed-world-cup-fixture-venues.ts [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import fixtureVenueSchedule from "../data/world-cup-2026/fixture-venues.json";
import { normalizeNationalTeamName } from "../src/lib/data/world-cup-2026-teams";
import { enrichMatchEnvironment } from "../src/lib/world-cup/enrich-matches";
import { buildTeamIdToGroupMap } from "../src/lib/world-cup/group-draw";
import {
  WORLD_CUP_FINALS_COMPETITION_OR,
  WORLD_CUP_FINALS_DATE_RANGE,
} from "../src/lib/world-cup/match-query";
import { filterWorldCup2026GroupStageMatches } from "../src/lib/world-cup/tournament-fixtures";
import { tryCreateServiceClient } from "../src/lib/supabase";

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

const dryRun = process.argv.includes("--dry-run");

type DbMatch = {
  id: string;
  date: string | null;
  time: string | null;
  competition: string | null;
  round: string | null;
  group_code: string | null;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  venue: string | null;
  venue_city: string | null;
  home_team_name?: string;
  away_team_name?: string;
};

function pairKey(
  date: string | null | undefined,
  homeId: string | null | undefined,
  awayId: string | null | undefined
): string | null {
  if (!date?.trim() || !homeId || !awayId) return null;
  const [a, b] = homeId < awayId ? [homeId, awayId] : [awayId, homeId];
  return `${date.trim()}|${a}|${b}`;
}

function buildNameToTeamId(teamNames: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, name] of teamNames) {
    out.set(normalizeNationalTeamName(name), id);
  }
  return out;
}

function summarizeCompetitions(rows: DbMatch[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = r.competition?.trim() || "(null)";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`)
    .join(", ");
}

async function main() {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    console.error("Missing Supabase service client (SUPABASE_SERVICE_ROLE_KEY in .env.local)");
    process.exit(1);
  }

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const teamToGroup = buildTeamIdToGroupMap(teamNames);
  const nameToTeamId = buildNameToTeamId(teamNames);

  const selectCols =
    "id, date, time, venue, venue_city, competition, round, group_code, home_team_id, away_team_id, home_goals, away_goals";

  const { data: finalsRows, error: finalsErr } = await supabase
    .from("matches")
    .select(selectCols)
    .or(WORLD_CUP_FINALS_COMPETITION_OR);

  if (finalsErr) {
    console.error(finalsErr.message);
    process.exit(1);
  }

  let rawRows = finalsRows ?? [];

  if (rawRows.length === 0) {
    const { data: dateRows, error: dateErr } = await supabase
      .from("matches")
      .select(selectCols)
      .gte("date", WORLD_CUP_FINALS_DATE_RANGE.start)
      .lte("date", WORLD_CUP_FINALS_DATE_RANGE.end);

    if (dateErr) {
      console.error(dateErr.message);
      process.exit(1);
    }
    rawRows = dateRows ?? [];
    if (rawRows.length > 0) {
      console.warn(
        `No rows matched ${WORLD_CUP_FINALS_COMPETITION_OR}; found ${rawRows.length} match(es) in tournament dates (${summarizeCompetitions(rawRows as DbMatch[])}).`
      );
    }
  }

  const mapped: DbMatch[] = rawRows.map((row) => ({
    id: row.id as string,
    date: row.date as string | null,
    time: row.time as string | null,
    competition: row.competition as string | null,
    round: row.round as string | null,
    group_code: row.group_code as string | null,
    status:
      row.home_goals != null && row.away_goals != null ? "finished" : "scheduled",
    home_team_id: row.home_team_id as string | null,
    away_team_id: row.away_team_id as string | null,
    home_goals: row.home_goals as number | null,
    away_goals: row.away_goals as number | null,
    venue: row.venue as string | null,
    venue_city: row.venue_city as string | null,
    home_team_name: row.home_team_id
      ? teamNames.get(row.home_team_id as string)
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(row.away_team_id as string)
      : undefined,
  }));

  const byPair = new Map<string, DbMatch>();
  for (const m of mapped) {
    const key = pairKey(m.date, m.home_team_id, m.away_team_id);
    if (key) byPair.set(key, m);
  }

  const filtered = filterWorldCup2026GroupStageMatches(mapped, teamToGroup);

  console.log(
    `Supabase: ${mapped.length} candidate row(s), ${filtered.length} pass group-stage filter, ${teamToGroup.size} teams mapped to draw`
  );

  if (mapped.length === 0) {
    console.error(
      "\nNo World Cup 2026 fixtures in Supabase. Import FBref data first:\n" +
        "  ./scripts/import-fbref-world-cup.sh\n" +
        "  (requires data/imports/fbref/world-cup/ and .env.local keys)\n"
    );
    process.exit(1);
  }

  if (filtered.length === 0 && mapped.length > 0) {
    console.warn(
      "Group-stage filter matched 0 rows — will still match by date + teams from fixture-venues.json."
    );
    const sample = mapped[0];
    console.warn(
      `Sample row: ${sample.date} ${sample.home_team_name} vs ${sample.away_team_name} competition=${sample.competition ?? "null"}`
    );
  }

  const catalog = fixtureVenueSchedule.fixtures;
  const targets: DbMatch[] = [];
  const unmatched: string[] = [];

  for (const fx of catalog) {
    const homeId = nameToTeamId.get(normalizeNationalTeamName(fx.home_team));
    const awayId = nameToTeamId.get(normalizeNationalTeamName(fx.away_team));
    if (!homeId || !awayId) {
      unmatched.push(
        `#${fx.match_number} ${fx.home_team} vs ${fx.away_team} (team not in Supabase teams)`
      );
      continue;
    }
    const key = pairKey(fx.date, homeId, awayId);
    const row = key ? byPair.get(key) : undefined;
    if (!row) {
      unmatched.push(
        `#${fx.match_number} ${fx.date} ${fx.home_team} vs ${fx.away_team} (no match row)`
      );
      continue;
    }
    targets.push({
      ...row,
      home_team_name: fx.home_team,
      away_team_name: fx.away_team,
      venue: fx.venue_raw,
    });
  }

  const uniqueTargets = [...new Map(targets.map((m) => [m.id, m])).values()];

  let updated = 0;
  let missingCity = 0;

  for (const m of uniqueTargets) {
    const patch = enrichMatchEnvironment(m, mapped, teamNames, { teamToGroup });
    if (!patch.venue_city) {
      missingCity += 1;
      console.warn(`No city for ${m.id} ${m.date} ${m.home_team_name} vs ${m.away_team_name}`);
      continue;
    }
    if (dryRun) {
      console.log(
        `${m.date} ${m.home_team_name} vs ${m.away_team_name} → ${patch.venue} (${patch.venue_city})`
      );
      updated += 1;
      continue;
    }
    const { error: updErr } = await supabase
      .from("matches")
      .update({
        venue: patch.venue,
        venue_city: patch.venue_city,
        venue_altitude_meters: patch.venue_altitude_meters,
      })
      .eq("id", m.id);
    if (updErr) {
      console.error(m.id, updErr.message);
    } else {
      updated += 1;
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Updated ${updated}/${uniqueTargets.length} fixtures ` +
      `(catalog ${catalog.length}, unmatched ${unmatched.length})`
  );

  if (unmatched.length > 0 && unmatched.length <= 12) {
    for (const line of unmatched) console.warn(`  ${line}`);
  } else if (unmatched.length > 12) {
    for (const line of unmatched.slice(0, 8)) console.warn(`  ${line}`);
    console.warn(`  … and ${unmatched.length - 8} more`);
  }

  if (uniqueTargets.length === 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
