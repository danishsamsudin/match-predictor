/**
 * Re-ingest finished fixtures so team xG comes from `/expected/fixtures`
 * (xG Basic) instead of the empty `include=xGFixture` path / shot proxy.
 *
 * Usage:
 *   npx tsx scripts/glpm-backfill-sm-expected-xg.ts --leagues=9,72
 *   npx tsx scripts/glpm-backfill-sm-expected-xg.ts --season=27903 --limit=50
 *   npx tsx scripts/glpm-backfill-sm-expected-xg.ts --dry-run
 */
import fs from "fs";
import path from "path";
import { ingestFixturesByIds } from "../src/lib/glpm/sportmonks/ingestFixturesBatch";
import { SM_LEAGUE, SM_SEASON_2026_27 } from "../src/lib/sportmonks/constants";
import { createSportmonksClient } from "../src/lib/sportmonks/client";
import { tryCreateServiceClient } from "../src/lib/supabase";

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

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const DEFAULT_LEAGUES = [
  SM_LEAGUE.CHAMPIONSHIP,
  SM_LEAGUE.EREDIVISIE,
  SM_LEAGUE.BUNDESLIGA,
  SM_LEAGUE.PREMIER_LEAGUE,
  SM_LEAGUE.SERIE_A,
];
/** Current season only — xG Basic feed is newest-first and covers 26/27 well. */
const DEFAULT_SEASONS = [
  SM_SEASON_2026_27.CHAMPIONSHIP,
  SM_SEASON_2026_27.EREDIVISIE,
  SM_SEASON_2026_27.BUNDESLIGA,
  SM_SEASON_2026_27.PREMIER_LEAGUE,
  SM_SEASON_2026_27.SERIE_A,
];

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const leagueRaw = argValue("leagues");
  const seasonRaw = argValue("season") ?? argValue("seasons");
  const limitRaw = argValue("limit");
  const leagueIds = leagueRaw
    ? leagueRaw.split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
    : DEFAULT_LEAGUES;
  const seasonIds = seasonRaw
    ? seasonRaw.split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
    : DEFAULT_SEASONS;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const client = createSportmonksClient();

  let query = supabase
    .from("glpm_matches")
    .select("sm_id, league_sm_id, season_id, match_date")
    .in("league_sm_id", leagueIds)
    .in("season_id", seasonIds)
    .not("home_score", "is", null)
    .order("match_date", { ascending: false });

  if (limit && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data: matches, error } = await query;
  if (error) throw new Error(error.message);

  const ids = [...new Set((matches ?? []).map((m) => Number(m.sm_id)).filter(Number.isFinite))];
  console.log(
    JSON.stringify(
      {
        dryRun,
        leagueIds,
        seasonIds,
        finishedMatches: ids.length,
        sample: (matches ?? []).slice(0, 5).map((m) => ({
          sm_id: m.sm_id,
          league: m.league_sm_id,
          season: m.season_id,
          date: m.match_date,
        })),
      },
      null,
      2
    )
  );

  if (!ids.length) {
    console.log("Nothing to backfill.");
    return;
  }

  const summary = await ingestFixturesByIds(supabase, ids, {
    client,
    buildFeatures: false,
    dryRun,
    // Full 26/27 Champ+Ere xG sits within ~180 pages of /expected/fixtures.
    expectedXgMaxScanPages: 250,
  });

  console.log(
    JSON.stringify(
      {
        attempted: summary.attempted,
        ok: summary.ok,
        flagged: summary.flagged,
        failed: summary.failed,
        errors: summary.errors.slice(0, 20),
        providerXgSample: summary.results.slice(0, 8).map((r) => ({
          matchSmId: r.matchSmId,
          validationStatus: r.validationStatus,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
