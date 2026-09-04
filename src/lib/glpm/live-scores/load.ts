import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTeamLogo } from "@/lib/data/team-logos";
import type { Database } from "@/lib/supabase";
import { DEFAULT_GLPM_LEAGUE_IDS } from "@/lib/sportmonks/constants";
import type { SmEvent, SmStatistic, SmXgFixtureRow } from "@/lib/sportmonks/types";
import {
  isFinishedFixture,
  SM_FIXTURE_STATE_FINISHED,
} from "@/lib/glpm/sportmonks/fixtureSchedule";
import {
  endOfZonedDayUtc,
  startOfZonedDayUtc,
} from "@/lib/glpm/sportmonks/matchday";
import {
  finishedStatusLabel,
  looksFinishedScoreboardRow,
  scoreboardCalendar,
  splitDayResults,
} from "./board";
import {
  LIVE_POLL_AFTER_KICKOFF_MS,
  LIVE_POLL_LEAD_MS,
  SM_FIXTURE_STATE_INPLAY,
} from "./constants";
import { formatRoundLabel, leagueMetaFromPayload } from "./league-meta";
import { mapFixtureLiveExtras } from "./map-timeline";
import { placeholderLiveScoresBoard } from "./placeholders";
import type { LiveScoreMatch, LiveScoresBoardPayload } from "./types";

export function emptyLiveScoresBoard(nowMs?: number): LiveScoresBoardPayload {
  const calendar = scoreboardCalendar(nowMs);
  return {
    matches: [],
    finishedToday: [],
    yesterday: [],
    todayDate: calendar.todayDate,
    yesterdayDate: calendar.yesterdayDate,
    syncedAt: null,
    source: "live",
  };
}

type Client = SupabaseClient<Database>;

type MatchRow = {
  sm_id: number;
  league_sm_id: number | null;
  home_team_sm_id: number | null;
  away_team_sm_id: number | null;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  gameweek: number | null;
  status: string | null;
  state_id: number | null;
  kickoff_at: string | null;
  match_date: string | null;
  synced_at: string | null;
  duration_minutes: number | null;
  payload: unknown;
};

const MATCH_SELECT =
  "sm_id,league_sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,venue,gameweek,status,state_id,kickoff_at,match_date,synced_at,duration_minutes,payload";

function teamNameFromPayload(
  payload: unknown,
  side: "home" | "away",
  fallbackId: number | null
): string {
  const fix = payload as {
    participants?: Array<{ id?: number; name?: string; meta?: { location?: string } }>;
  } | null;
  const parts = fix?.participants ?? [];
  const byLoc = parts.find((p) => p.meta?.location === side);
  if (byLoc?.name) return byLoc.name;
  if (fallbackId != null) {
    const byId = parts.find((p) => p.id === fallbackId);
    if (byId?.name) return byId.name;
  }
  return side === "home" ? "Home" : "Away";
}

function logoFromPayload(
  payload: unknown,
  teamSmId: number | null,
  teamName: string
): string | null {
  const fix = payload as {
    participants?: Array<{ id?: number; image_path?: string }>;
  } | null;
  if (teamSmId != null) {
    const part = fix?.participants?.find((p) => p.id === teamSmId);
    if (part?.image_path) return part.image_path;
  }
  const local = resolveTeamLogo({ id: teamSmId ?? 0, name: teamName });
  return local || null;
}

function liveStatusLabel(row: MatchRow): string {
  const raw = row.status?.trim();
  if (raw) return raw;
  if (row.state_id === 2) return "1st Half";
  if (row.state_id === 3) return "HT";
  if (row.state_id === 4) return "2nd Half";
  if (row.state_id === 6 || row.state_id === 21) return "ET";
  if (row.state_id === 22) return "Pens";
  return "Live";
}

function minuteFromPayload(payload: unknown): number | null {
  const fix = payload as {
    periods?: Array<{
      ticking?: boolean;
      minutes?: number | null;
      time_added?: number | null;
    }>;
  } | null;
  const periods = fix?.periods ?? [];
  const active = periods.find((p) => p.ticking) ?? periods[periods.length - 1];
  if (active?.minutes == null) return null;
  return Math.round(active.minutes + (active.time_added ?? 0));
}

function isLiveBoardCandidate(row: MatchRow, nowMs: number): boolean {
  if (row.state_id != null && SM_FIXTURE_STATE_FINISHED.has(row.state_id)) return false;
  if (
    isFinishedFixture({
      id: row.sm_id,
      stateId: row.state_id,
      stateName: row.status,
    })
  ) {
    return false;
  }
  if (row.state_id != null && SM_FIXTURE_STATE_INPLAY.has(row.state_id)) return true;

  const kickMs = row.kickoff_at ? Date.parse(row.kickoff_at) : NaN;
  if (!Number.isFinite(kickMs)) return false;
  return kickMs <= nowMs + LIVE_POLL_LEAD_MS && kickMs >= nowMs - LIVE_POLL_AFTER_KICKOFF_MS;
}

function mapRow(row: MatchRow, options?: { asResult?: boolean; nowMs?: number }): LiveScoreMatch | null {
  if (row.home_team_sm_id == null || row.away_team_sm_id == null) return null;

  const meta = leagueMetaFromPayload(row.league_sm_id, row.payload);
  const homeTeamName = teamNameFromPayload(row.payload, "home", row.home_team_sm_id);
  const awayTeamName = teamNameFromPayload(row.payload, "away", row.away_team_sm_id);
  const stadium =
    row.venue ??
    (row.payload as { venue?: { name?: string } } | null)?.venue?.name ??
    "Stadium TBC";

  const payload = row.payload as {
    events?: SmEvent[];
    statistics?: SmStatistic[];
    xGFixture?: SmXgFixtureRow[];
    length?: number;
    round?: { name?: string };
  } | null;

  const extras = mapFixtureLiveExtras(
    {
      events: payload?.events,
      statistics: payload?.statistics,
      xGFixture: payload?.xGFixture,
    },
    row.home_team_sm_id,
    row.away_team_sm_id
  );

  const asResult =
    options?.asResult === true ||
    (options?.nowMs != null && looksFinishedScoreboardRow(row, options.nowMs));
  const durationMinutes = row.duration_minutes ?? payload?.length ?? 90;

  return {
    matchSmId: row.sm_id,
    leagueName: meta.name,
    countryIso: meta.countryIso,
    countryName: meta.countryName,
    stadiumName: stadium,
    gameweek: row.gameweek,
    roundLabel: formatRoundLabel(row.gameweek, payload?.round?.name),
    homeTeamName,
    awayTeamName,
    homeTeamSmId: row.home_team_sm_id,
    awayTeamSmId: row.away_team_sm_id,
    homeLogoUrl: logoFromPayload(row.payload, row.home_team_sm_id, homeTeamName),
    awayLogoUrl: logoFromPayload(row.payload, row.away_team_sm_id, awayTeamName),
    homeScore: row.home_score ?? 0,
    awayScore: row.away_score ?? 0,
    statusLabel: asResult ? finishedStatusLabel(row) : liveStatusLabel(row),
    minute: asResult ? durationMinutes : minuteFromPayload(row.payload),
    durationMinutes,
    kickoffAt: row.kickoff_at,
    timeline: extras.timeline,
    homeMetrics: extras.homeMetrics,
    awayMetrics: extras.awayMetrics,
    isPlaceholder: false,
  };
}

function latestSyncedAt(rows: MatchRow[]): string | null {
  return (
    rows
      .map((r) => r.synced_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null
  );
}

function mapRows(rows: MatchRow[], options?: { asResult?: boolean; nowMs?: number }): LiveScoreMatch[] {
  return rows.map((row) => mapRow(row, options)).filter((m): m is LiveScoreMatch => m != null);
}

/**
 * Load in-play matches plus today's finished scores and yesterday's results.
 * Uses request time (`Date.now()`), so the caller page must be dynamic.
 * Demo cards are opt-in via `includePlaceholdersWhenEmpty`.
 */
export async function loadLiveScoresBoard(
  client: Client,
  options?: { includePlaceholdersWhenEmpty?: boolean; nowMs?: number }
): Promise<LiveScoresBoardPayload> {
  const includePlaceholders = options?.includePlaceholdersWhenEmpty === true;
  const nowMs = options?.nowMs ?? Date.now();
  const calendar = scoreboardCalendar(nowMs);
  const empty = (): LiveScoresBoardPayload => emptyLiveScoresBoard(nowMs);

  const liveWindowStart = new Date(nowMs - LIVE_POLL_AFTER_KICKOFF_MS).toISOString();
  const liveWindowEnd = new Date(nowMs + LIVE_POLL_LEAD_MS).toISOString();
  const dayStart = startOfZonedDayUtc(calendar.yesterdayDate, calendar.timeZone).toISOString();
  const dayEnd = endOfZonedDayUtc(calendar.todayDate, calendar.timeZone).toISOString();

  const liveQuery = client
    .from("glpm_matches")
    .select(MATCH_SELECT)
    .gte("kickoff_at", liveWindowStart)
    .lte("kickoff_at", liveWindowEnd)
    .in("league_sm_id", DEFAULT_GLPM_LEAGUE_IDS)
    .order("kickoff_at", { ascending: true })
    .limit(24);

  const dayQuery = client
    .from("glpm_matches")
    .select(MATCH_SELECT)
    .gte("kickoff_at", dayStart)
    .lt("kickoff_at", dayEnd)
    .order("kickoff_at", { ascending: true })
    .limit(160);

  const [liveRes, dayRes] = await Promise.all([liveQuery, dayQuery]);

  if (liveRes.error) {
    console.warn(`[live-scores] live load failed: ${liveRes.error.message}`);
  }
  if (dayRes.error) {
    console.warn(`[live-scores] results load failed: ${dayRes.error.message}`);
  }

  if (liveRes.error && dayRes.error) {
    return includePlaceholders ? placeholderLiveScoresBoard() : empty();
  }

  const liveRows = ((liveRes.data as MatchRow[] | null) ?? []).filter((row) =>
    isLiveBoardCandidate(row, nowMs)
  );
  const inplay = liveRows.filter(
    (row) => row.state_id != null && SM_FIXTURE_STATE_INPLAY.has(row.state_id)
  );
  const selectedLive = inplay.length > 0 ? inplay : liveRows;
  const live = mapRows(selectedLive);

  const liveIds = new Set(live.map((m) => m.matchSmId));
  const dayRows = (dayRes.data as MatchRow[] | null) ?? [];
  const split = splitDayResults({
    rows: dayRows,
    liveIds,
    todayDate: calendar.todayDate,
    yesterdayDate: calendar.yesterdayDate,
    timeZone: calendar.timeZone,
    nowMs,
  });

  const finishedToday = mapRows(split.finishedToday, { asResult: true, nowMs });
  const yesterday = mapRows(split.yesterday, { asResult: true, nowMs }).sort((a, b) => {
    const league = a.leagueName.localeCompare(b.leagueName);
    if (league !== 0) return league;
    return (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? "");
  });

  if (live.length === 0 && finishedToday.length === 0 && yesterday.length === 0) {
    return includePlaceholders ? placeholderLiveScoresBoard() : empty();
  }

  return {
    matches: live,
    finishedToday,
    yesterday,
    todayDate: calendar.todayDate,
    yesterdayDate: calendar.yesterdayDate,
    syncedAt: latestSyncedAt([...selectedLive, ...split.finishedToday, ...split.yesterday]),
    source: "live",
  };
}
