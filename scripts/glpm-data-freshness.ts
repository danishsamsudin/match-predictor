/**
 * GLPM data freshness + live API health check across all tracked leagues.
 *
 * Usage:
 *   npx tsx scripts/glpm-data-freshness.ts
 *   npx tsx scripts/glpm-data-freshness.ts --stale-days 10
 *   npm run glpm:data-freshness
 *
 * Checks:
 *  1) SportMonks live (league + season + recent fixtures)
 *  2) Supabase GLPM match / stats / prediction freshness per league
 *  3) Daily sync windows (last N days)
 *  4) RapidAPI SportAPI7 smoke (optional; skipped if no key)
 */
import { loadEnvLocal } from "./load-env-local";
import { createServiceClient, hasServiceRoleKey } from "../src/lib/supabase";
import { createSportmonksClient } from "../src/lib/sportmonks/client";
import {
  SM_LEAGUE,
  SM_SEASON_2026_27,
} from "../src/lib/sportmonks/constants";
import { GLPM_LEAGUE_META } from "../src/lib/glpm/live-scores/league-meta";
import { SM_FIXTURE_STATE_FINISHED } from "../src/lib/glpm/sportmonks/fixtureSchedule";

type LeagueRow = {
  key: string;
  name: string;
  leagueSmId: number;
  seasonId: number;
};

const LEAGUES: LeagueRow[] = [
  {
    key: "PREMIER_LEAGUE",
    name: GLPM_LEAGUE_META[SM_LEAGUE.PREMIER_LEAGUE]?.name ?? "Premier League",
    leagueSmId: SM_LEAGUE.PREMIER_LEAGUE,
    seasonId: SM_SEASON_2026_27.PREMIER_LEAGUE,
  },
  {
    key: "CHAMPIONSHIP",
    name: GLPM_LEAGUE_META[SM_LEAGUE.CHAMPIONSHIP]?.name ?? "Championship",
    leagueSmId: SM_LEAGUE.CHAMPIONSHIP,
    seasonId: SM_SEASON_2026_27.CHAMPIONSHIP,
  },
  {
    key: "EREDIVISIE",
    name: GLPM_LEAGUE_META[SM_LEAGUE.EREDIVISIE]?.name ?? "Eredivisie",
    leagueSmId: SM_LEAGUE.EREDIVISIE,
    seasonId: SM_SEASON_2026_27.EREDIVISIE,
  },
  {
    key: "SERIE_A",
    name: GLPM_LEAGUE_META[SM_LEAGUE.SERIE_A]?.name ?? "Serie A",
    leagueSmId: SM_LEAGUE.SERIE_A,
    seasonId: SM_SEASON_2026_27.SERIE_A,
  },
  {
    key: "BUNDESLIGA",
    name: GLPM_LEAGUE_META[SM_LEAGUE.BUNDESLIGA]?.name ?? "Bundesliga",
    leagueSmId: SM_LEAGUE.BUNDESLIGA,
    seasonId: SM_SEASON_2026_27.BUNDESLIGA,
  },
];

function parseStaleDays(argv: string[]): number {
  const idx = argv.indexOf("--stale-days");
  if (idx < 0) return 10;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function daysBetween(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function fmtDays(days: number | null): string {
  if (days == null) return "-";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function mark(ok: boolean, warn = false): string {
  if (ok) return "OK";
  if (warn) return "WARN";
  return "FAIL";
}

async function checkSportmonksLeague(
  client: ReturnType<typeof createSportmonksClient>,
  league: LeagueRow
): Promise<{
  ok: boolean;
  message: string;
  apiFinishedCount: number;
  apiUpcomingCount: number;
  apiLatestFinished: string | null;
  apiNextKickoff: string | null;
}> {
  try {
    const seasonRes = await client.getSeason(league.seasonId);
    const seasonName =
      (seasonRes as { data?: { name?: string } })?.data?.name ?? String(league.seasonId);

    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 21);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 21);
    const fromYmd = from.toISOString().slice(0, 10);
    const toYmd = to.toISOString().slice(0, 10);

    const fixtures = await client.getFixturesBetween(fromYmd, toYmd, {
      leagueIds: [league.leagueSmId],
      include: "state;participants",
      maxPages: 5,
    });

    const finished = fixtures.filter((f) => {
      const stateId = f.state_id ?? f.state?.id ?? null;
      return stateId != null && SM_FIXTURE_STATE_FINISHED.has(stateId);
    });
    const upcoming = fixtures.filter((f) => {
      const stateId = f.state_id ?? f.state?.id ?? null;
      return stateId == null || !SM_FIXTURE_STATE_FINISHED.has(stateId);
    });

    const latestFinished = finished
      .map((f) => f.starting_at ?? f.starting_at_timestamp)
      .filter(Boolean)
      .sort()
      .at(-1);
    const nextKickoff = upcoming
      .map((f) => f.starting_at ?? null)
      .filter((v): v is string => typeof v === "string")
      .sort()
      .at(0);

    return {
      ok: true,
      message: `season ${seasonName}; ${fixtures.length} fixtures ±21d`,
      apiFinishedCount: finished.length,
      apiUpcomingCount: upcoming.length,
      apiLatestFinished:
        typeof latestFinished === "string"
          ? latestFinished.slice(0, 10)
          : latestFinished != null
            ? String(latestFinished)
            : null,
      apiNextKickoff: nextKickoff?.slice(0, 16)?.replace("T", " ") ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      apiFinishedCount: 0,
      apiUpcomingCount: 0,
      apiLatestFinished: null,
      apiNextKickoff: null,
    };
  }
}

async function checkDbLeague(
  supabase: ReturnType<typeof createServiceClient>,
  league: LeagueRow
): Promise<{
  matchCount: number;
  finishedCount: number;
  upcomingCount: number;
  lastSyncedAt: string | null;
  latestFinishedDate: string | null;
  nextKickoff: string | null;
  statsWithXg: number;
  predictions: number;
  lastPredictionAt: string | null;
  vectorCount: number;
  lastVectorAt: string | null;
}> {
  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id, status, state_id, match_date, kickoff_at, synced_at, home_score, away_score")
    .eq("season_id", league.seasonId);

  if (matchErr) throw new Error(`glpm_matches: ${matchErr.message}`);

  const rows = matches ?? [];
  const finished = rows.filter(
    (m) => m.state_id != null && SM_FIXTURE_STATE_FINISHED.has(m.state_id)
  );
  const upcoming = rows.filter(
    (m) =>
      !(m.state_id != null && SM_FIXTURE_STATE_FINISHED.has(m.state_id)) &&
      (m.kickoff_at == null || new Date(m.kickoff_at).getTime() >= Date.now() - 3 * 3600_000)
  );

  const lastSyncedAt =
    rows
      .map((m) => m.synced_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const latestFinishedDate =
    finished
      .map((m) => m.match_date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const nextKickoff =
    upcoming
      .map((m) => m.kickoff_at)
      .filter((v): v is string => typeof v === "string")
      .sort()
      .at(0) ?? null;

  const finishedIds = finished.map((m) => m.sm_id);
  let statsWithXg = 0;
  if (finishedIds.length) {
    const chunk = finishedIds.slice(0, 200);
    const { data: stats } = await supabase
      .from("glpm_match_team_stats")
      .select("match_sm_id, xg, shots")
      .in("match_sm_id", chunk)
      .not("xg", "is", null);
    statsWithXg = new Set((stats ?? []).map((s) => s.match_sm_id)).size;
  }

  // Hub cards use CX snapshots; fall back to base history if CX is empty.
  const { data: cxPreds } = await supabase
    .from("glpm_cx_prediction_history")
    .select("executed_at, match_sm_id")
    .eq("season_id", league.seasonId)
    .order("executed_at", { ascending: false })
    .limit(50);
  const { data: basePreds } =
    cxPreds && cxPreds.length
      ? { data: null as { executed_at: string; match_sm_id: number | null }[] | null }
      : await supabase
          .from("glpm_prediction_history")
          .select("executed_at, match_sm_id")
          .eq("season_id", league.seasonId)
          .order("executed_at", { ascending: false })
          .limit(50);
  const preds = (cxPreds && cxPreds.length ? cxPreds : basePreds) ?? [];

  const { data: vectors } = await supabase
    .from("glpm_team_rating_vectors")
    .select("updated_at")
    .eq("season_id", league.seasonId)
    .order("updated_at", { ascending: false })
    .limit(1);

  // Prefer prior-season vectors if 2026/27 has none yet (common early season).
  let vectorCount = 0;
  let lastVectorAt: string | null = vectors?.[0]?.updated_at ?? null;
  if (lastVectorAt) {
    const { count } = await supabase
      .from("glpm_team_rating_vectors")
      .select("*", { count: "exact", head: true })
      .eq("season_id", league.seasonId);
    vectorCount = count ?? 0;
  }

  return {
    matchCount: rows.length,
    finishedCount: finished.length,
    upcomingCount: upcoming.length,
    lastSyncedAt,
    latestFinishedDate,
    nextKickoff: nextKickoff?.slice(0, 16)?.replace("T", " ") ?? null,
    statsWithXg,
    predictions: preds.length,
    lastPredictionAt: preds[0]?.executed_at ?? null,
    vectorCount,
    lastVectorAt,
  };
}

async function checkDailySyncWindows(
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const { data, error } = await supabase
    .from("glpm_daily_sync_windows")
    .select(
      "match_date, empty_matchday, lineup_done, results_done, refresh_done, fixture_ids, updated_at"
    )
    .order("match_date", { ascending: false })
    .limit(10);

  if (error) {
    console.log(`  FAIL daily sync windows: ${error.message}`);
    return;
  }

  if (!data?.length) {
    console.log("  WARN no daily sync window rows (cron may not have run yet)");
    return;
  }

  console.log(
    `  ${pad("date", 12)} ${pad("fixtures", 9)} ${pad("empty", 6)} ${pad("lineup", 7)} ${pad("results", 8)} ${pad("refresh", 8)} updated`
  );
  for (const w of data) {
    const n = Array.isArray(w.fixture_ids) ? w.fixture_ids.length : 0;
    console.log(
      `  ${pad(w.match_date, 12)} ${pad(String(n), 9)} ${pad(w.empty_matchday ? "yes" : "no", 6)} ${pad(w.lineup_done ? "yes" : "no", 7)} ${pad(w.results_done ? "yes" : "no", 8)} ${pad(w.refresh_done ? "yes" : "no", 8)} ${w.updated_at?.slice(0, 19)?.replace("T", " ") ?? "-"}`
    );
  }
}

async function checkRapidApi(): Promise<{ ok: boolean; message: string }> {
  const key = process.env.RAPIDAPI_KEY ?? process.env.FOOTBALL_API_KEY;
  if (!key) return { ok: false, message: "no RAPIDAPI_KEY" };

  const host =
    process.env.SPORTAPI_RAPIDAPI_HOST ??
    (process.env.FOOTBALL_PROVIDER?.includes("rapidapi.com")
      ? process.env.FOOTBALL_PROVIDER
      : "sportapi7.p.rapidapi.com");
  const today = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `https://${host}/api/v1/sport/football/${today}/0/categories`,
      {
        headers: {
          "X-RapidAPI-Key": key,
          "X-RapidAPI-Host": host,
        },
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    const json = (await res.json()) as { categories?: unknown[] };
    return {
      ok: true,
      message: `${json.categories?.length ?? 0} categories for ${today}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const staleDays = parseStaleDays(argv);
  const now = new Date();

  console.log("═".repeat(72));
  console.log(" GLPM data freshness + API health");
  console.log("═".repeat(72));
  console.log(` now: ${now.toISOString()}`);
  console.log(` stale threshold: ${staleDays} days (sync / predictions)`);
  console.log(
    ` note: during Nations League / international breaks, finished-match`
  );
  console.log(
    `       dates can lag while APIs and sync windows still look healthy.`
  );
  console.log("");

  let failures = 0;
  let warnings = 0;

  // ── Credentials ──────────────────────────────────────────────────────
  console.log("Credentials");
  const hasSm = Boolean(process.env.SPORTMONKS_API_TOKEN);
  const hasSb = hasServiceRoleKey() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasRapid = Boolean(process.env.RAPIDAPI_KEY ?? process.env.FOOTBALL_API_KEY);
  console.log(`  SportMonks token: ${hasSm ? "set" : "MISSING"}`);
  console.log(`  Supabase service: ${hasSb ? "set" : "MISSING"}`);
  console.log(`  RapidAPI key:     ${hasRapid ? "set" : "missing (optional)"}`);
  if (!hasSm || !hasSb) {
    console.error("\nMissing required credentials in .env.local");
    process.exit(1);
  }
  console.log("");

  const client = createSportmonksClient();
  const supabase = createServiceClient();

  // ── RapidAPI ─────────────────────────────────────────────────────────
  console.log("RapidAPI (SportAPI7)");
  const rapid = await checkRapidApi();
  console.log(`  ${mark(rapid.ok)} ${rapid.message}`);
  if (!rapid.ok && hasRapid) failures += 1;
  console.log("");

  // ── Daily sync windows ───────────────────────────────────────────────
  console.log("Daily sync windows (last 10)");
  await checkDailySyncWindows(supabase);
  console.log("");

  // ── Per-league ───────────────────────────────────────────────────────
  console.log("Per-league SportMonks + DB");
  console.log("-".repeat(72));

  for (const league of LEAGUES) {
    console.log(`\n${league.name} (league ${league.leagueSmId}, season ${league.seasonId})`);

    const api = await checkSportmonksLeague(client, league);
    console.log(`  SportMonks API: ${mark(api.ok)} ${api.message}`);
    if (!api.ok) {
      failures += 1;
      continue;
    }
    console.log(
      `    finished(±21d)=${api.apiFinishedCount}  upcoming(±21d)=${api.apiUpcomingCount}`
    );
    console.log(
      `    latest finished: ${api.apiLatestFinished ?? "-"} (${fmtDays(daysBetween(api.apiLatestFinished, now))})`
    );
    console.log(`    next kickoff:    ${api.apiNextKickoff ?? "-"}`);

    let db;
    try {
      db = await checkDbLeague(supabase, league);
    } catch (err) {
      console.log(`  DB: FAIL ${err instanceof Error ? err.message : err}`);
      failures += 1;
      continue;
    }

    const syncAge = daysBetween(db.lastSyncedAt, now);
    const finishedAge = daysBetween(db.latestFinishedDate, now);
    const predAge = daysBetween(db.lastPredictionAt, now);

    const syncOk = syncAge != null && syncAge <= staleDays;
    const hasMatches = db.matchCount > 0;
    const statsOk =
      db.finishedCount === 0 || db.statsWithXg > 0;
    const predOk =
      db.upcomingCount === 0 ||
      (db.predictions > 0 && predAge != null && predAge <= staleDays);

    if (!hasMatches) {
      console.log(`  DB: FAIL no matches for season ${league.seasonId}`);
      failures += 1;
      continue;
    }

    if (!syncOk) {
      console.log(
        `  DB sync: ${mark(false)} last synced ${db.lastSyncedAt?.slice(0, 19)?.replace("T", " ") ?? "-"} (${fmtDays(syncAge)})`
      );
      failures += 1;
    } else {
      console.log(
        `  DB sync: ${mark(true)} last synced ${db.lastSyncedAt?.slice(0, 19)?.replace("T", " ") ?? "-"} (${fmtDays(syncAge)})`
      );
    }

    console.log(
      `  DB matches: total=${db.matchCount} finished=${db.finishedCount} upcoming=${db.upcomingCount}`
    );
    console.log(
      `  Latest finished match_date: ${db.latestFinishedDate ?? "-"} (${fmtDays(finishedAge)})`
    );
    if (finishedAge != null && finishedAge > staleDays) {
      console.log(
        `  NOTE: no finished club match in ${finishedAge}d — likely international break, not an API outage`
      );
      warnings += 1;
    }
    console.log(`  Next DB kickoff: ${db.nextKickoff ?? "-"}`);
    console.log(
      `  Team stats with xG (sample): ${db.statsWithXg}/${Math.min(db.finishedCount, 200)} finished`
    );
    if (!statsOk) {
      console.log(`  Stats: WARN finished matches present but no xG rows`);
      warnings += 1;
    }

    console.log(
      `  CX predictions: recent sample=${db.predictions} last=${db.lastPredictionAt?.slice(0, 19)?.replace("T", " ") ?? "-"} (${fmtDays(predAge)})`
    );
    if (!predOk) {
      console.log(
        `  CX predictions: WARN upcoming fixtures exist but predictions look stale/missing`
      );
      warnings += 1;
    }

    console.log(
      `  Rating vectors: count=${db.vectorCount} last=${db.lastVectorAt?.slice(0, 19)?.replace("T", " ") ?? "-"}`
    );
  }

  console.log("\n" + "═".repeat(72));
  console.log(` Done — ${failures} failure(s), ${warnings} warning(s)`);
  if (failures > 0) {
    console.log(
      " Tip: try `npm run glpm:sm-daily-sync -- --phase auto` or `npm run glpm:sm-refresh-schedules`"
    );
  }
  console.log("═".repeat(72));
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
