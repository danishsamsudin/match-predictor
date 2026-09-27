/**
 * Resume MD1 lineup scrape for fixtures missing from md1-starting-xis.json.
 * Calls SofaScore directly (bypasses internal football_api_daily budget).
 *
 *   npx tsx scripts/nl-scrape-md1-lineups-resume.ts
 */
import fs from "fs";
import path from "path";
import fixtureVenueSchedule from "../data/nations-league-2026/fixture-venues.json";
import { sofascoreGet } from "../src/lib/api/sofascore/client";
import type { SofascoreLineupsResponse } from "../src/lib/api/sofascore/types";

type NlVenueFixture = {
  sofascore_event_id: number;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  kickoff_utc: string;
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

type Payload = {
  fixtures: Array<{
    sofascoreEventId: number;
    kickoffUtc: string;
    home: Md1TeamLineup;
    away: Md1TeamLineup;
    confirmed: boolean | null;
    source: string;
  }>;
  teams: Md1TeamLineup[];
  fixtureCount: number;
  teamCount: number;
  scrapedAt: string;
  failures: Array<{ id: number; reason: string }>;
  [key: string]: unknown;
};

const OUT = path.join(process.cwd(), "data/nations-league-2026/md1-starting-xis.json");
const MD1_START = "2026-09-24";
const MD1_END = "2026-09-26";

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
  return {
    teamId,
    teamName,
    formation: side?.formation?.trim() || null,
    starters: players.filter((p) => !p.substitute),
    substitutes: players.filter((p) => p.substitute),
  };
}

async function main() {
  loadEnvLocal();
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8")) as Payload;
  const have = new Set(existing.fixtures.map((f) => f.sofascoreEventId));
  const remaining = (fixtureVenueSchedule as { fixtures: NlVenueFixture[] }).fixtures.filter(
    (row) => {
      const d = (row.kickoff_utc ?? "").slice(0, 10);
      return d >= MD1_START && d <= MD1_END && !have.has(row.sofascore_event_id);
    }
  );

  console.log(`Resume remaining: ${remaining.length}`);
  const failures: Array<{ id: number; reason: string }> = [];

  for (let i = 0; i < remaining.length; i++) {
    const fx = remaining[i]!;
    process.stdout.write(
      `[${i + 1}/${remaining.length}] ${fx.sofascore_event_id} ${fx.home} vs ${fx.away}... `
    );
    try {
      const data = await sofascoreGet<SofascoreLineupsResponse>("matches/get-lineups", {
        matchId: fx.sofascore_event_id,
      });
      const home = mapSide(data.home, fx.home_team_id, fx.home);
      const away = mapSide(data.away, fx.away_team_id, fx.away);
      if (home.starters.length < 11 || away.starters.length < 11) {
        const reason = `incomplete starters ${home.starters.length}/${away.starters.length}`;
        console.log(`SKIP ${reason}`);
        failures.push({ id: fx.sofascore_event_id, reason });
        await sleep(300);
        continue;
      }
      existing.fixtures.push({
        sofascoreEventId: fx.sofascore_event_id,
        kickoffUtc: fx.kickoff_utc,
        home,
        away,
        confirmed: data.confirmed ?? null,
        source: "sofascore",
      });
      console.log(
        `OK ${home.starters.length}/${away.starters.length} bench ${home.substitutes.length}/${away.substitutes.length}`
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.log(`FAIL ${reason}`);
      failures.push({ id: fx.sofascore_event_id, reason });
    }
    await sleep(300);
  }

  const byTeam = new Map<number, Md1TeamLineup>();
  for (const f of existing.fixtures) {
    byTeam.set(f.home.teamId, f.home);
    byTeam.set(f.away.teamId, f.away);
  }
  existing.teams = [...byTeam.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
  );
  existing.fixtureCount = existing.fixtures.length;
  existing.teamCount = existing.teams.length;
  existing.scrapedAt = new Date().toISOString();
  existing.failures = failures;

  fs.writeFileSync(OUT, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(
    `Wrote ${OUT}: fixtures=${existing.fixtureCount} teams=${existing.teamCount} failures=${failures.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
