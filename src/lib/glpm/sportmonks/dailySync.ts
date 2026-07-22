/**
 * SportMonks daily sync phases for GLPM (morning / lineup / results / auto).
 *
 * Matchday calendar uses GLPM_MATCHDAY_TIMEZONE (IANA), e.g. Africa/Lagos or Europe/Berlin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import { tryCreateServiceClient } from "../../supabase";
import {
  createSportmonksClient,
  DEFAULT_GLPM_LEAGUE_IDS,
  PLAN_FIXTURE_INCLUDE,
  type SportmonksClient,
} from "../../sportmonks/client";
import type { SmFixture } from "../../sportmonks/types";
import { chunkIds } from "../../sportmonks/constants";
import { isFinishedFixture } from "./fixtureSchedule";
import {
  addCalendarDays,
  buildMatchdayWindowPlan,
  formatDateInTimeZone,
  hasConfirmedLineups,
  resolveAutoPhase,
  resolveMatchdayTimeZone,
  type DailySyncPhase,
} from "./matchday";
import {
  loadDailySyncWindow,
  patchDailySyncWindow,
  upsertMorningWindow,
} from "./dailySyncWindow";
import {
  fixtureToMatchdayRef,
  ingestFixturePayloads,
  ingestFixturesByIds,
  type BatchIngestSummary,
} from "./ingestFixturesBatch";
import { refreshGlpmStandings } from "../refresh-standings";
import { runGlpmNightRefresh, type NightRefreshSummary } from "./nightRefresh";

type Client = SupabaseClient<Database>;

const LINEUP_INCLUDE = [
  "participants",
  "state",
  "venue",
  "weatherReport",
  "lineups",
  "lineups.details.type",
  "formations",
  "sidelined",
  "scores",
  "season",
  "league",
].join(";");

export type DailySyncOptions = {
  phase?: DailySyncPhase | "auto";
  timeZone?: string;
  matchDate?: string;
  leagueIds?: number[];
  dryRun?: boolean;
  client?: SportmonksClient;
  supabase?: Client;
};

export type DailySyncSummary = {
  phase: DailySyncPhase | "auto";
  resolvedPhase: DailySyncPhase;
  timeZone: string;
  matchDate: string;
  dryRun: boolean;
  fixtureCount: number;
  ingest?: BatchIngestSummary;
  standings?: unknown;
  refresh?: NightRefreshSummary;
  window?: unknown;
  notes: string[];
};

async function requireSupabase(existing?: Client): Promise<Client> {
  const sb = existing ?? tryCreateServiceClient();
  if (!sb) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return sb;
}

function mergeSummaries(a: BatchIngestSummary, b: BatchIngestSummary): BatchIngestSummary {
  return {
    attempted: a.attempted + b.attempted,
    ok: a.ok + b.ok,
    flagged: a.flagged + b.flagged,
    failed: a.failed + b.failed,
    errors: [...a.errors, ...b.errors],
    results: [...a.results, ...b.results],
  };
}

export async function runMorningPhase(options: DailySyncOptions = {}): Promise<DailySyncSummary> {
  const notes: string[] = [];
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const now = new Date();
  const matchDate = options.matchDate ?? formatDateInTimeZone(now, timeZone);
  const yesterday = addCalendarDays(matchDate, -1);
  const leagueIds = options.leagueIds ?? DEFAULT_GLPM_LEAGUE_IDS;
  const dryRun = Boolean(options.dryRun);
  const sm = options.client ?? createSportmonksClient();
  const supabase = await requireSupabase(options.supabase);

  notes.push(`Fetching SportMonks fixtures for ${yesterday} and ${matchDate} (${timeZone})`);

  const [ydayFixtures, todayFixtures] = await Promise.all([
    sm.getFixturesByDate(yesterday, { leagueIds, include: PLAN_FIXTURE_INCLUDE }),
    sm.getFixturesByDate(matchDate, { leagueIds, include: PLAN_FIXTURE_INCLUDE }),
  ]);

  const byId = new Map<number, (typeof todayFixtures)[number]>();
  for (const f of [...ydayFixtures, ...todayFixtures]) byId.set(f.id, f);
  const allFetched = [...byId.values()];

  const plan = buildMatchdayWindowPlan({
    fixtures: allFetched.map(fixtureToMatchdayRef),
    matchDate,
    timeZone,
  });

  const slateIds = new Set(plan.fixtureIds);
  const morningPayloads = allFetched.filter((f) => slateIds.has(f.id));

  // Catch-up: still-open games from yesterday (late FT / postponed spill).
  const catchUp = ydayFixtures.filter((f) => {
    const ref = fixtureToMatchdayRef(f);
    return !isFinishedFixture({
      id: ref.id,
      startingAt: ref.startingAt,
      stateId: ref.stateId,
    });
  });

  const catchUpExtra = catchUp.filter((f) => !slateIds.has(f.id));
  const toIngest = [...morningPayloads, ...catchUpExtra];

  const ingest = await ingestFixturePayloads(supabase, toIngest, {
    buildFeatures: false,
    dryRun,
  });

  const morningSummary = {
    fetchedToday: todayFixtures.length,
    fetchedYesterday: ydayFixtures.length,
    slate: plan.fixtureIds.length,
    catchUpExtra: catchUpExtra.length,
    ingest,
    firstKickoffAt: plan.firstKickoffAt,
    lastKickoffAt: plan.lastKickoffAt,
    lineupDueAt: plan.lineupDueAt,
    resultsDueAt: plan.resultsDueAt,
    refreshDueAt: plan.refreshDueAt,
  };

  const window = dryRun
    ? plan
    : await upsertMorningWindow(supabase, plan, morningSummary);

  if (plan.emptyMatchday) notes.push("Empty matchday — lineup/results/refresh marked done");

  return {
    phase: "morning",
    resolvedPhase: "morning",
    timeZone,
    matchDate,
    dryRun,
    fixtureCount: plan.fixtureIds.length,
    ingest,
    window,
    notes,
  };
}

export async function runLineupPhase(options: DailySyncOptions = {}): Promise<DailySyncSummary> {
  const notes: string[] = [];
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const matchDate =
    options.matchDate ?? formatDateInTimeZone(new Date(), timeZone);
  const dryRun = Boolean(options.dryRun);
  const supabase = await requireSupabase(options.supabase);
  const sm = options.client ?? createSportmonksClient();

  let window = await loadDailySyncWindow(supabase, matchDate);
  if (!window) {
    notes.push("No morning window — bootstrapping morning first");
    const morning = await runMorningPhase({ ...options, supabase, client: sm });
    window = await loadDailySyncWindow(supabase, matchDate);
    if (!window) {
      return {
        phase: "lineup",
        resolvedPhase: "lineup",
        timeZone,
        matchDate,
        dryRun,
        fixtureCount: morning.fixtureCount,
        ingest: morning.ingest,
        notes: [...notes, "Failed to persist morning window"],
      };
    }
  }

  if (window.empty_matchday || window.lineup_done) {
    notes.push(window.empty_matchday ? "Empty matchday" : "Lineup already done");
    return {
      phase: "lineup",
      resolvedPhase: "lineup",
      timeZone: window.time_zone,
      matchDate,
      dryRun,
      fixtureCount: window.fixture_ids.length,
      window,
      notes,
    };
  }

  const pulled: SmFixture[] = [];
  for (const idChunk of chunkIds(window.fixture_ids, 50)) {
    if (dryRun) {
      pulled.push(...idChunk.map((id) => ({ id } as SmFixture)));
      continue;
    }
    const res = await sm.getFixturesMulti(idChunk, LINEUP_INCLUDE);
    const page = Array.isArray(res.data) ? res.data : [];
    pulled.push(...page);
  }

  const ingest = dryRun
    ? {
        attempted: window.fixture_ids.length,
        ok: 0,
        flagged: 0,
        failed: 0,
        errors: [] as string[],
        results: [],
      }
    : await ingestFixturePayloads(supabase, pulled, { buildFeatures: false });

  let confirmed = 0;
  let confirmedFixtures = 0;
  for (const f of pulled) {
    if (hasConfirmedLineups(f.lineups)) {
      confirmedFixtures += 1;
      confirmed += (f.lineups ?? []).filter((l) => l.type_id === 11).length;
    }
  }
  const allConfirmed =
    window.fixture_ids.length === 0 || confirmedFixtures >= window.fixture_ids.length;

  const firstKickMs = window.first_kickoff_at
    ? Date.parse(window.first_kickoff_at)
    : null;
  const pastFirstKickoff = firstKickMs != null && Date.now() >= firstKickMs;
  const markDone = allConfirmed || pastFirstKickoff;
  if (pastFirstKickoff && !allConfirmed) {
    notes.push("Past first kickoff — marking lineup phase done even if some XIs incomplete");
  }
  if (allConfirmed) notes.push("Confirmed lineups for all slate fixtures");

  const patched = dryRun
    ? window
    : await patchDailySyncWindow(supabase, matchDate, {
        lineup_done: markDone,
        lineup_confirmed_count: confirmed,
        lineup_summary: { ingest, confirmedStarters: confirmed, allConfirmed, pastFirstKickoff },
      });

  return {
    phase: "lineup",
    resolvedPhase: "lineup",
    timeZone: window.time_zone,
    matchDate,
    dryRun,
    fixtureCount: window.fixture_ids.length,
    ingest,
    window: patched,
    notes,
  };
}

export async function runResultsPhase(options: DailySyncOptions = {}): Promise<DailySyncSummary> {
  const notes: string[] = [];
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const matchDate =
    options.matchDate ?? formatDateInTimeZone(new Date(), timeZone);
  const dryRun = Boolean(options.dryRun);
  const supabase = await requireSupabase(options.supabase);
  const sm = options.client ?? createSportmonksClient();

  let window = await loadDailySyncWindow(supabase, matchDate);
  if (!window) {
    notes.push("No morning window — bootstrapping morning first");
    await runMorningPhase({ ...options, supabase, client: sm });
    window = await loadDailySyncWindow(supabase, matchDate);
    if (!window) throw new Error("Failed to bootstrap daily sync window");
  }

  if (window.empty_matchday || window.results_done) {
    notes.push(window.empty_matchday ? "Empty matchday" : "Results already done");
    return {
      phase: "results",
      resolvedPhase: "results",
      timeZone: window.time_zone,
      matchDate,
      dryRun,
      fixtureCount: window.fixture_ids.length,
      window,
      notes,
    };
  }

  const ingest = await ingestFixturesByIds(supabase, window.fixture_ids, {
    client: sm,
    include: PLAN_FIXTURE_INCLUDE,
    buildFeatures: true,
    forceFeatures: true,
    dryRun,
  });

  // Also catch any finished fixtures from yesterday still missing scores in DB.
  const yesterday = addCalendarDays(matchDate, -1);
  const yday = await sm.getFixturesByDate(yesterday, {
    leagueIds: options.leagueIds ?? DEFAULT_GLPM_LEAGUE_IDS,
    include: PLAN_FIXTURE_INCLUDE,
  });
  const ydayFinished = yday.filter((f) =>
    isFinishedFixture({
      id: f.id,
      startingAt: f.starting_at ?? null,
      stateId: f.state_id ?? f.state?.id ?? null,
    })
  );
  const catchUp = await ingestFixturePayloads(supabase, ydayFinished, {
    buildFeatures: true,
    forceFeatures: true,
    dryRun,
  });
  const merged = mergeSummaries(ingest, catchUp);

  let standings: unknown = null;
  if (!dryRun) {
    const { data: matchRows } = await supabase
      .from("glpm_matches")
      .select("season_id")
      .in("sm_id", window.fixture_ids);
    const seasons = [
      ...new Set(
        (matchRows ?? [])
          .map((r) => r.season_id)
          .filter((id): id is number => id != null)
      ),
    ];
    if (seasons.length) {
      standings = await refreshGlpmStandings(supabase, {
        seasonIds: seasons,
        trigger: "github",
        writeSnapshot: true,
      });
      notes.push(`Standings refreshed for seasons ${seasons.join(", ")}`);
    }
  }

  const refreshDueAt =
    window.refresh_due_at ??
    (window.results_due_at
      ? new Date(Date.parse(window.results_due_at) + 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString());

  const patched = dryRun
    ? window
    : await patchDailySyncWindow(supabase, matchDate, {
        results_done: true,
        refresh_due_at: refreshDueAt,
        results_summary: { ingest: merged, standings },
      });

  return {
    phase: "results",
    resolvedPhase: "results",
    timeZone: window.time_zone,
    matchDate,
    dryRun,
    fixtureCount: window.fixture_ids.length,
    ingest: merged,
    standings,
    window: patched,
    notes,
  };
}

export async function runDailySync(options: DailySyncOptions = {}): Promise<DailySyncSummary> {
  const requested = options.phase ?? "auto";
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const matchDate =
    options.matchDate ?? formatDateInTimeZone(new Date(), timeZone);
  const supabase = await requireSupabase(options.supabase);

  if (requested === "morning") return runMorningPhase(options);
  if (requested === "lineup") return runLineupPhase(options);
  if (requested === "results") return runResultsPhase(options);
  if (requested === "refresh") {
    const refresh = await runGlpmNightRefresh({
      matchDate,
      timeZone,
      dryRun: options.dryRun,
      supabase,
    });
    return {
      phase: "refresh",
      resolvedPhase: "refresh",
      timeZone,
      matchDate,
      dryRun: Boolean(options.dryRun),
      fixtureCount: 0,
      refresh,
      notes: refresh.notes,
    };
  }

  // auto
  const window = await loadDailySyncWindow(supabase, matchDate);
  const resolved = resolveAutoPhase(
    window
      ? {
          emptyMatchday: window.empty_matchday,
          lineupDone: window.lineup_done,
          resultsDone: window.results_done,
          refreshDone: window.refresh_done,
          lineupDueAt: window.lineup_due_at,
          resultsDueAt: window.results_due_at,
          refreshDueAt: window.refresh_due_at,
        }
      : null
  );

  if (resolved === "morning") return runMorningPhase(options);
  if (resolved === "lineup") return runLineupPhase(options);
  if (resolved === "results") return runResultsPhase(options);
  if (resolved === "refresh") {
    const refresh = await runGlpmNightRefresh({
      matchDate,
      timeZone,
      dryRun: options.dryRun,
      supabase,
    });
    return {
      phase: "auto",
      resolvedPhase: "refresh",
      timeZone,
      matchDate,
      dryRun: Boolean(options.dryRun),
      fixtureCount: window?.fixture_ids.length ?? 0,
      refresh,
      window,
      notes: ["Dispatcher selected refresh", ...refresh.notes],
    };
  }

  return {
    phase: "auto",
    resolvedPhase: "idle",
    timeZone,
    matchDate,
    dryRun: Boolean(options.dryRun),
    fixtureCount: window?.fixture_ids.length ?? 0,
    window,
    notes: [
      window
        ? `Idle — next due lineup=${window.lineup_due_at ?? "-"} results=${window.results_due_at ?? "-"} refresh=${window.refresh_due_at ?? "-"}`
        : "Idle — no window (run morning)",
    ],
  };
}
