/**
 * Scrape Sofascore confirmed MD1 starting XIs (+ bench) for Nations League 2026/27.
 *
 * Writes:
 *   data/nations-league-2026/md1-starting-xis.json
 * Optionally upserts synced_event_lineups when Supabase service role is set.
 *
 * Usage:
 *   npx tsx scripts/nl-scrape-md1-lineups.ts
 *   npx tsx scripts/nl-scrape-md1-lineups.ts --dry-run
 *   npx tsx scripts/nl-scrape-md1-lineups.ts --no-db
 */
import fs from "fs";
import path from "path";
import fixtureVenueSchedule from "../data/nations-league-2026/fixture-venues.json";
import { sofascoreGet } from "../src/lib/api/sofascore/client";
import type { SofascoreLineupsResponse } from "../src/lib/api/sofascore/types";
import { hasServiceRoleKey, tryCreateServiceClient } from "../src/lib/supabase";

type NlVenueFixture = {
  sofascore_event_id: number;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  kickoff_utc: string;
  venue_city: string | null;
};

type Md1Player = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  jerseyNumber: string | null;
  substitute: boolean;
};

type Md1TeamLineup = {
  teamId: number;
  teamName: string;
  formation: string | null;
  starters: Md1Player[];
  substitutes: Md1Player[];
};

type Md1FixtureLineups = {
  sofascoreEventId: number;
  kickoffUtc: string;
  home: Md1TeamLineup;
  away: Md1TeamLineup;
  confirmed: boolean | null;
  source: "sofascore";
};

const MD1_START = "2026-09-24";
const MD1_END = "2026-09-26";
const OUT_PATH = path.join(
  process.cwd(),
  "data/nations-league-2026/md1-starting-xis.json"
);

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapSide(
  side: SofascoreLineupsResponse["home"] | undefined,
  teamId: number,
  teamName: string
): Md1TeamLineup {
  const players = (side?.players ?? []).map((row) => ({
    sofascorePlayerId: row.player.id,
    name: row.player.name,
    position: row.position ?? row.player.position ?? null,
    jerseyNumber: row.player.jerseyNumber ?? null,
    substitute: Boolean(row.substitute),
  }));
  const starters = players.filter((p) => !p.substitute);
  const substitutes = players.filter((p) => p.substitute);
  return {
    teamId,
    teamName,
    formation: side?.formation?.trim() || null,
    starters,
    substitutes,
  };
}

function md1Fixtures(): NlVenueFixture[] {
  const rows = (fixtureVenueSchedule as { fixtures: NlVenueFixture[] }).fixtures;
  return rows.filter((row) => {
    const d = (row.kickoff_utc ?? "").slice(0, 10);
    return d >= MD1_START && d <= MD1_END;
  });
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const noDb = process.argv.includes("--no-db") || dryRun;
  const fixtures = md1Fixtures();
  console.log(`MD1 fixtures: ${fixtures.length}`);

  const scraped: Md1FixtureLineups[] = [];
  const failures: Array<{ id: number; reason: string }> = [];
  const now = new Date().toISOString();
  const supabase = !noDb && hasServiceRoleKey() ? tryCreateServiceClient() : null;

  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i]!;
    const label = `${fx.home} vs ${fx.away}`;
    process.stdout.write(`[${i + 1}/${fixtures.length}] ${fx.sofascore_event_id} ${label}... `);
    try {
      // Direct SofaScore call - bypasses internal football_api_daily budget
      // (this is an explicit admin scrape, not a hot-path request).
      const data = await sofascoreGet<SofascoreLineupsResponse>("matches/get-lineups", {
        matchId: fx.sofascore_event_id,
      });
      const home = mapSide(data.home, fx.home_team_id, fx.home);
      const away = mapSide(data.away, fx.away_team_id, fx.away);
      if (home.starters.length < 11 || away.starters.length < 11) {
        const reason = `incomplete starters home=${home.starters.length} away=${away.starters.length}`;
        console.log(`SKIP ${reason}`);
        failures.push({ id: fx.sofascore_event_id, reason });
        await sleep(350);
        continue;
      }
      const row: Md1FixtureLineups = {
        sofascoreEventId: fx.sofascore_event_id,
        kickoffUtc: fx.kickoff_utc,
        home,
        away,
        confirmed: data.confirmed ?? null,
        source: "sofascore",
      };
      scraped.push(row);
      console.log(
        `OK starters ${home.starters.length}/${away.starters.length} bench ${home.substitutes.length}/${away.substitutes.length} form ${home.formation ?? "-"}/${away.formation ?? "-"}`
      );

      if (supabase) {
        await supabase.from("synced_event_lineups").upsert({
          event_id: fx.sofascore_event_id,
          payload: data,
          confirmed: data.confirmed ?? null,
          synced_at: now,
        });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.log(`FAIL ${reason}`);
      failures.push({ id: fx.sofascore_event_id, reason });
    }
    await sleep(350);
  }

  const teams = scraped.flatMap((f) => [f.home, f.away]);
  const byTeamId = new Map<number, Md1TeamLineup>();
  for (const t of teams) byTeamId.set(t.teamId, t);

  const payload = {
    competition: "UEFA Nations League 2026/27",
    matchday: 1,
    window: { start: MD1_START, end: MD1_END },
    scrapedAt: now,
    source: "sofascore",
    fixtureCount: scraped.length,
    teamCount: byTeamId.size,
    fixtures: scraped,
    teams: [...byTeamId.values()].sort((a, b) =>
      a.teamName.localeCompare(b.teamName)
    ),
    failures,
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2).slice(0, 2000));
    console.log(`\nDry run - would write ${OUT_PATH}`);
  } else {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${OUT_PATH}`);
  }

  console.log(
    `Done. fixtures=${scraped.length}/${fixtures.length} teams=${byTeamId.size} failures=${failures.length} db=${supabase ? "upserted" : "skipped"}`
  );
  if (failures.length) {
    for (const f of failures) console.warn(`  fail ${f.id}: ${f.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
