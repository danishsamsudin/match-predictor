import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTeamLogo } from "@/lib/data/team-logos";
import type { Database } from "@/lib/supabase";
import { DEFAULT_GLPM_LEAGUE_IDS } from "@/lib/sportmonks/constants";
import {
  isFinishedFixture,
  SM_FIXTURE_STATE_FINISHED,
} from "@/lib/glpm/sportmonks/fixtureSchedule";
import {
  LIVE_POLL_AFTER_KICKOFF_MS,
  LIVE_POLL_LEAD_MS,
  SM_FIXTURE_STATE_INPLAY,
} from "./constants";
import { formatRoundLabel, leagueMetaForId } from "./league-meta";
import { placeholderLiveScoresBoard } from "./placeholders";
import type { LiveScoreMatch, LiveScoresBoardPayload } from "./types";

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
  synced_at: string | null;
  payload: unknown;
};

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

function statusLabel(row: MatchRow): string {
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

function mapRow(row: MatchRow): LiveScoreMatch | null {
  if (row.home_team_sm_id == null || row.away_team_sm_id == null) return null;

  const meta = leagueMetaForId(row.league_sm_id);
  const homeTeamName = teamNameFromPayload(row.payload, "home", row.home_team_sm_id);
  const awayTeamName = teamNameFromPayload(row.payload, "away", row.away_team_sm_id);
  const stadium =
    row.venue ??
    (row.payload as { venue?: { name?: string } } | null)?.venue?.name ??
    "Stadium TBC";

  return {
    matchSmId: row.sm_id,
    leagueName: meta.name,
    countryIso: meta.countryIso,
    countryName: meta.countryName,
    stadiumName: stadium,
    gameweek: row.gameweek,
    roundLabel: formatRoundLabel(row.gameweek),
    homeTeamName,
    awayTeamName,
    homeTeamSmId: row.home_team_sm_id,
    awayTeamSmId: row.away_team_sm_id,
    homeLogoUrl: logoFromPayload(row.payload, row.home_team_sm_id, homeTeamName),
    awayLogoUrl: logoFromPayload(row.payload, row.away_team_sm_id, awayTeamName),
    homeScore: row.home_score ?? 0,
    awayScore: row.away_score ?? 0,
    statusLabel: statusLabel(row),
    minute: minuteFromPayload(row.payload),
    kickoffAt: row.kickoff_at,
    isPlaceholder: false,
  };
}

/**
 * Load in-play (or soft live-window) matches for the home board.
 * Falls back to placeholders when nothing is live so layout can be reviewed.
 */
export async function loadLiveScoresBoard(
  client: Client,
  options?: { includePlaceholdersWhenEmpty?: boolean; nowMs?: number }
): Promise<LiveScoresBoardPayload> {
  const includePlaceholders = options?.includePlaceholdersWhenEmpty !== false;
  const nowMs = options?.nowMs ?? Date.now();
  const windowStart = new Date(nowMs - LIVE_POLL_AFTER_KICKOFF_MS).toISOString();
  const windowEnd = new Date(nowMs + LIVE_POLL_LEAD_MS).toISOString();

  const { data, error } = await client
    .from("glpm_matches")
    .select(
      "sm_id,league_sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,venue,gameweek,status,state_id,kickoff_at,synced_at,payload"
    )
    .gte("kickoff_at", windowStart)
    .lte("kickoff_at", windowEnd)
    .in("league_sm_id", DEFAULT_GLPM_LEAGUE_IDS)
    .order("kickoff_at", { ascending: true })
    .limit(24);

  if (error) {
    console.warn(`[live-scores] load failed: ${error.message}`);
    return includePlaceholders
      ? placeholderLiveScoresBoard()
      : { matches: [], syncedAt: null, source: "live" };
  }

  const rows = (data as MatchRow[] | null) ?? [];
  const candidates = rows.filter((row) => isLiveBoardCandidate(row, nowMs));
  const inplay = candidates.filter(
    (row) => row.state_id != null && SM_FIXTURE_STATE_INPLAY.has(row.state_id)
  );
  const selected = inplay.length > 0 ? inplay : candidates;

  const live = selected
    .map(mapRow)
    .filter((m): m is LiveScoreMatch => m != null);

  if (live.length === 0) {
    return includePlaceholders
      ? placeholderLiveScoresBoard()
      : { matches: [], syncedAt: null, source: "live" };
  }

  const syncedAt =
    selected
      .map((r) => r.synced_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  return { matches: live, syncedAt, source: "live" };
}
