import { fetchSoccerdata } from "@/lib/api/soccerdata/service";
import type { SoccerdataDataFrame } from "@/lib/api/soccerdata/types";
import { soccerdataLeagueIdForReference } from "@/lib/config/soccerdata-leagues";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";
import { normalizeTeamName } from "@/lib/soccerdata/normalize";
import { upsertTeamAliasesFromNameList } from "@/lib/soccerdata/team-aliases";
import type { TeamAliasSource } from "@/lib/soccerdata/team-aliases";

type FixtureRow = Record<string, unknown>;

function asDataFrame(data: unknown): SoccerdataDataFrame {
  if (!data || typeof data !== "object") throw new UpstreamApiError("Invalid SoccerData response.");
  const d = data as SoccerdataDataFrame;
  if (d.kind !== "dataframe" || !Array.isArray(d.records)) {
    throw new UpstreamApiError("Expected dataframe from SoccerData.");
  }
  return d;
}

/** FBref often blocks automated scrapes (403 / Cloudflare). */
function isFbrefBlockedError(message: string): boolean {
  return /fbref\.com|403|Could not download.*\/comps/i.test(message);
}

/** Use only two-digit season codes for FBref (e.g. "2526"), not bare years like 2025. */
function fbrefSeasonsFromInput(seasons: Array<string | number>): string[] {
  const out = new Set<string>();
  for (const s of seasons) {
    if (typeof s === "string" && /^\d{4}$/.test(s)) out.add(s);
    if (typeof s === "number" && s >= 1900 && s < 2100) {
      const yy = s % 100;
      const end = (yy + 1) % 100;
      out.add(`${String(yy).padStart(2, "0")}${String(end).padStart(2, "0")}`);
    }
  }
  return [...out];
}

/** Understat uses the season start year (e.g. 2025 for 2025/26). */
function understatSeasonsFromInput(seasons: Array<string | number>): number[] {
  const out = new Set<number>();
  for (const s of seasons) {
    if (typeof s === "number" && s >= 1900 && s < 2100) out.add(s);
    if (typeof s === "string" && /^\d{4}$/.test(s)) {
      const startYy = parseInt(s.slice(0, 2), 10);
      out.add(2000 + startYy);
    }
  }
  if (out.size === 0) out.add(new Date().getUTCFullYear());
  return [...out];
}

function parseKickoff(row: FixtureRow): string | null {
  const v = row.date ?? row.match_date ?? row.kickoff_time ?? row.kickoff_at;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  return null;
}

function getTeamName(row: FixtureRow, side: "home" | "away"): string | null {
  const keys =
    side === "home"
      ? ["home", "home_team", "home_team_name", "squad_home", "team_home"]
      : ["away", "away_team", "away_team_name", "squad_away", "team_away"];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function fetchScheduleDataframe(input: {
  referenceLeagueId: number;
  seasons: Array<string | number>;
  force?: boolean;
}): Promise<{ df: SoccerdataDataFrame; source: TeamAliasSource }> {
  const fbrefLeague = soccerdataLeagueIdForReference("FBref", input.referenceLeagueId);
  const fbrefSeasons = fbrefSeasonsFromInput(input.seasons);

  if (fbrefLeague && fbrefSeasons.length > 0) {
    try {
      const res = await fetchSoccerdata({
        source: "FBref",
        method: "read_schedule",
        constructor: { leagues: [fbrefLeague], seasons: fbrefSeasons },
        params: { force_cache: Boolean(input.force) },
        persist: true,
      });
      return { df: asDataFrame(res.data), source: "FBref" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isFbrefBlockedError(message)) throw error;
      // Fall through to Understat when FBref is blocked.
    }
  }

  const understatLeague = soccerdataLeagueIdForReference("Understat", input.referenceLeagueId);
  const understatSeasons = understatSeasonsFromInput(input.seasons);
  if (!understatLeague) {
    throw new UpstreamApiError(
      `FBref schedule failed (often 403 / bot block) and no Understat mapping exists for league ${input.referenceLeagueId}. ` +
        "Run POST /api/cron/sync for fixtures, or try again later / from another network."
    );
  }

  const res = await fetchSoccerdata({
    source: "Understat",
    method: "read_schedule",
    constructor: { leagues: [understatLeague], seasons: understatSeasons },
    params: { force_cache: Boolean(input.force) },
    persist: true,
  });
  return { df: asDataFrame(res.data), source: "Understat" };
}

/**
 * Import fixtures from SoccerData schedules into canonical `synced_fixtures`.
 * Tries FBref first; falls back to Understat when FBref returns 403 / Cloudflare blocks.
 */
export async function importFixturesFromFbref(input: {
  referenceLeagueId: number;
  seasons: Array<string | number>;
  force?: boolean;
}): Promise<{
  fixturesUpserted: number;
  aliasesUpserted: number;
  scheduleSource: TeamAliasSource;
}> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const fbrefMapped = soccerdataLeagueIdForReference("FBref", input.referenceLeagueId);
  const understatMapped = soccerdataLeagueIdForReference("Understat", input.referenceLeagueId);
  if (!fbrefMapped && !understatMapped) {
    throw new UpstreamApiError(
      `No FBref or Understat league mapping for referenceLeagueId=${input.referenceLeagueId}.`
    );
  }

  const { df, source } = await fetchScheduleDataframe(input);

  const teamNames = new Set<string>();
  for (const row of df.records) {
    const home = getTeamName(row, "home");
    const away = getTeamName(row, "away");
    if (home) teamNames.add(home);
    if (away) teamNames.add(away);
  }

  const aliasRes = await upsertTeamAliasesFromNameList({
    leagueId: input.referenceLeagueId,
    source,
    soccerdataTeamNames: Array.from(teamNames),
  });
  const aliasesUpserted = "inserted" in aliasRes ? aliasRes.inserted : 0;

  const fixtures: Array<{
    event_id: number;
    league_id: number;
    league_name: string;
    season: number;
    kickoff_at: string;
    venue_city: string;
    home_team_id: number;
    home_team_name: string;
    away_team_id: number;
    away_team_name: string;
    synced_at: string;
  }> = [];

  const { data: leagueRow } = await supabase
    .from("synced_fixtures")
    .select("league_name, season")
    .eq("league_id", input.referenceLeagueId)
    .limit(1)
    .maybeSingle();

  const leagueName = leagueRow?.league_name ?? `League ${input.referenceLeagueId}`;
  const seasonFallback = leagueRow?.season ?? new Date().getUTCFullYear();

  const { data: teams, error: teamsErr } = await supabase
    .from("synced_teams")
    .select("team_id, team_name")
    .eq("league_id", input.referenceLeagueId);
  if (teamsErr) throw new UpstreamApiError(teamsErr.message);
  const teamsByNorm = new Map<string, { id: number; name: string }>();
  for (const t of teams ?? []) {
    teamsByNorm.set(normalizeTeamName(t.team_name), { id: t.team_id, name: t.team_name });
  }

  const now = new Date().toISOString();
  for (const row of df.records) {
    const kickoff = parseKickoff(row);
    const homeName = getTeamName(row, "home");
    const awayName = getTeamName(row, "away");
    if (!kickoff || !homeName || !awayName) continue;

    const home = teamsByNorm.get(normalizeTeamName(homeName));
    const away = teamsByNorm.get(normalizeTeamName(awayName));
    if (!home || !away) continue;

    const key = `${kickoff}|${home.id}|${away.id}|${input.referenceLeagueId}`;
    const hash = Array.from(key).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const eventId = -Number(hash % 2_000_000_000);

    fixtures.push({
      event_id: eventId,
      league_id: input.referenceLeagueId,
      league_name: leagueName,
      season: seasonFallback,
      kickoff_at: kickoff,
      venue_city: "Unknown",
      home_team_id: home.id,
      home_team_name: home.name,
      away_team_id: away.id,
      away_team_name: away.name,
      synced_at: now,
    });
  }

  if (fixtures.length === 0) {
    return { fixturesUpserted: 0, aliasesUpserted, scheduleSource: source };
  }

  const { error: fixErr } = await supabase.from("synced_fixtures").upsert(fixtures, {
    onConflict: "event_id",
  });
  if (fixErr) throw new UpstreamApiError(fixErr.message);

  return { fixturesUpserted: fixtures.length, aliasesUpserted, scheduleSource: source };
}
