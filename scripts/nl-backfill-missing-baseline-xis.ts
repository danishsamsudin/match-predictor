/**
 * Backfill NL baseline XIs for teams that skipped Matchday 1
 * (e.g. Azerbaijan, Gibraltar debut on MD2).
 *
 * Scrapes each missing team's first scheduled fixture lineup from Sofascore
 * and merges into data/nations-league-2026/md1-starting-xis.json.
 *
 *   npx tsx scripts/nl-backfill-missing-baseline-xis.ts
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

function firstFixtureForTeam(
  teamId: number,
  venues: NlVenueFixture[]
): NlVenueFixture | null {
  const matches = venues
    .filter((f) => f.home_team_id === teamId || f.away_team_id === teamId)
    .sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
  return matches[0] ?? null;
}

async function main() {
  loadEnvLocal();
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8")) as Payload;
  const haveTeams = new Set(existing.teams.map((t) => t.teamId));
  const haveFixtures = new Set(existing.fixtures.map((f) => f.sofascoreEventId));
  const venues = (fixtureVenueSchedule as { fixtures: NlVenueFixture[] }).fixtures;

  const allTeamIds = new Set<number>();
  for (const f of venues) {
    allTeamIds.add(f.home_team_id);
    allTeamIds.add(f.away_team_id);
  }

  const missingTeamIds = [...allTeamIds].filter((id) => !haveTeams.has(id)).sort();
  console.log(`Missing baseline teams: ${missingTeamIds.length}`);

  const failures: Array<{ id: number; reason: string }> = [...(existing.failures ?? [])];
  const eventIdsToScrape = new Set<number>();

  for (const teamId of missingTeamIds) {
    const fx = firstFixtureForTeam(teamId, venues);
    if (!fx) {
      failures.push({ id: teamId, reason: "no fixture found for team" });
      continue;
    }
    eventIdsToScrape.add(fx.sofascore_event_id);
  }

  const toScrape = [...eventIdsToScrape].filter((id) => !haveFixtures.has(id));
  console.log(`Fixtures to scrape: ${toScrape.length}`);

  for (let i = 0; i < toScrape.length; i++) {
    const eventId = toScrape[i]!;
    const fx = venues.find((f) => f.sofascore_event_id === eventId)!;
    process.stdout.write(
      `[${i + 1}/${toScrape.length}] ${eventId} ${fx.home} vs ${fx.away}... `
    );
    try {
      const data = await sofascoreGet<SofascoreLineupsResponse>("matches/get-lineups", {
        matchId: eventId,
      });
      const home = mapSide(data.home, fx.home_team_id, fx.home);
      const away = mapSide(data.away, fx.away_team_id, fx.away);
      if (home.starters.length < 11 || away.starters.length < 11) {
        const reason = `incomplete starters ${home.starters.length}/${away.starters.length}`;
        console.log(`SKIP ${reason}`);
        failures.push({ id: eventId, reason });
        await sleep(300);
        continue;
      }
      existing.fixtures.push({
        sofascoreEventId: eventId,
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
      failures.push({ id: eventId, reason });
    }
    await sleep(300);
  }

  const byTeam = new Map<number, Md1TeamLineup>();
  // Earliest matchday sheet wins so MD1 stays the tournament baseline.
  const sortedFixtures = [...existing.fixtures].sort((a, b) =>
    a.kickoffUtc.localeCompare(b.kickoffUtc)
  );
  for (const f of sortedFixtures) {
    if (!byTeam.has(f.home.teamId) && f.home.starters.length >= 11) {
      byTeam.set(f.home.teamId, f.home);
    }
    if (!byTeam.has(f.away.teamId) && f.away.starters.length >= 11) {
      byTeam.set(f.away.teamId, f.away);
    }
  }

  existing.teams = [...byTeam.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
  );
  existing.fixtureCount = existing.fixtures.length;
  existing.teamCount = existing.teams.length;
  existing.scrapedAt = new Date().toISOString();
  existing.failures = failures.filter((f) => Number.isFinite(f.id));

  fs.writeFileSync(OUT, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(
    `Wrote ${OUT}: fixtures=${existing.fixtureCount} teams=${existing.teamCount} failures=${existing.failures.length}`
  );
  const stillMissing = missingTeamIds.filter((id) => !byTeam.has(id));
  if (stillMissing.length) {
    console.warn("Still missing team ids:", stillMissing.join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
