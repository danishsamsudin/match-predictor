import { fetchSoccerdata } from "@/lib/api/soccerdata/service";
import type { SoccerdataDataFrame } from "@/lib/api/soccerdata/types";
import { soccerdataLeagueIdForReference } from "@/lib/config/soccerdata-leagues";
import { matchHistorySeasonCandidates } from "@/lib/soccerdata/seasons";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";
import { normalizeTeamName, normalizeText } from "@/lib/soccerdata/normalize";

function isMatchHistoryDownloadError(message: string): boolean {
  return /football-data\.co\.uk|Could not download.*\.csv/i.test(message);
}

function asDataFrame(data: unknown): SoccerdataDataFrame {
  const d = data as SoccerdataDataFrame;
  if (!d || d.kind !== "dataframe") throw new UpstreamApiError("Expected dataframe from SoccerData.");
  return d;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

type CanonicalEvent = {
  eventId: number;
  kickoffAt: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
};

async function loadCanonicalEvents(leagueId: number): Promise<CanonicalEvent[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data, error } = await supabase
    .from("synced_events")
    .select("event_id, kickoff_at, payload")
    .eq("reference_league_id", leagueId)
    .order("kickoff_at", { ascending: false })
    .limit(2000);

  if (error) throw new UpstreamApiError(error.message);

  const events: CanonicalEvent[] = [];
  for (const row of data ?? []) {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const homeRaw =
      (payload["homeTeam"] as unknown) ?? (payload["home"] as unknown) ?? (payload["home_team"] as unknown);
    const awayRaw =
      (payload["awayTeam"] as unknown) ?? (payload["away"] as unknown) ?? (payload["away_team"] as unknown);

    const home = homeRaw && typeof homeRaw === "object" ? (homeRaw as Record<string, unknown>) : null;
    const away = awayRaw && typeof awayRaw === "object" ? (awayRaw as Record<string, unknown>) : null;

    const homeId = home && typeof home["id"] === "number" ? (home["id"] as number) : null;
    const awayId = away && typeof away["id"] === "number" ? (away["id"] as number) : null;
    const homeName = home && typeof home["name"] === "string" ? (home["name"] as string) : null;
    const awayName = away && typeof away["name"] === "string" ? (away["name"] as string) : null;
    events.push({
      eventId: row.event_id,
      kickoffAt: row.kickoff_at ?? null,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeamName: homeName,
      awayTeamName: awayName,
    });
  }
  return events;
}

function findBestEventMatch(input: {
  events: CanonicalEvent[];
  kickoffIso: string;
  homeName: string;
  awayName: string;
}): { event: CanonicalEvent; confidence: number } | null {
  const kickoff = new Date(input.kickoffIso).getTime();
  const homeNorm = normalizeTeamName(input.homeName);
  const awayNorm = normalizeTeamName(input.awayName);

  let best: { event: CanonicalEvent; score: number } | null = null;

  for (const e of input.events) {
    if (!e.kickoffAt) continue;
    const t = new Date(e.kickoffAt).getTime();
    const dtHours = Math.abs(t - kickoff) / (1000 * 60 * 60);
    if (dtHours > 36) continue;

    const eHomeNorm = e.homeTeamName ? normalizeTeamName(e.homeTeamName) : "";
    const eAwayNorm = e.awayTeamName ? normalizeTeamName(e.awayTeamName) : "";
    const nameMatch = eHomeNorm === homeNorm && eAwayNorm === awayNorm ? 1 : 0;
    const score = nameMatch * 10 - dtHours;
    if (!best || score > best.score) best = { event: e, score };
  }

  if (!best) return null;
  const confidence = best.score >= 9 ? 0.95 : best.score >= 7 ? 0.85 : 0.7;
  return { event: best.event, confidence };
}

export async function importUnderstatXgToCanonical(input: {
  referenceLeagueId: number;
  seasons: Array<string | number>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const league = soccerdataLeagueIdForReference("Understat", input.referenceLeagueId);
  if (!league) {
    throw new UpstreamApiError(
      `No Understat league mapping configured for referenceLeagueId=${input.referenceLeagueId}.`
    );
  }

  // Understat schedule often includes xG fields; we ingest and then map.
  const res = await fetchSoccerdata({
    source: "Understat",
    method: "read_schedule",
    constructor: { leagues: [league], seasons: input.seasons },
    persist: true,
  });

  const df = asDataFrame(res.data);
  const events = await loadCanonicalEvents(input.referenceLeagueId);

  let linked = 0;
  for (const row of df.records) {
    const kickoffIso = toIso(row.date ?? row.kickoff_at ?? row.datetime);
    const home = pickString(row, ["home", "home_team", "h", "team_home"]);
    const away = pickString(row, ["away", "away_team", "a", "team_away"]);
    if (!kickoffIso || !home || !away) continue;

    const match = findBestEventMatch({ events, kickoffIso, homeName: home, awayName: away });
    if (!match) continue;

    const xgHome = pickNumber(row, ["xg_home", "home_xg", "xG_home", "xG_h", "xgH", "xG"]);
    const xgAway = pickNumber(row, ["xg_away", "away_xg", "xG_away", "xG_a", "xgA", "xGA"]);

    const key = `Understat:${input.referenceLeagueId}:${normalizeText(kickoffIso)}:${normalizeText(home)}:${normalizeText(away)}`;
    await supabase.from("soccerdata_match_links").upsert(
      {
        event_id: match.event.eventId,
        league_id: input.referenceLeagueId,
        source: "Understat",
        soccerdata_match_key: key,
        kickoff_at: kickoffIso,
        home_team_id: match.event.homeTeamId,
        away_team_id: match.event.awayTeamId,
        confidence: match.confidence,
        linked_by: "date+home+away",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,source" }
    );

    await supabase.from("soccerdata_event_enrichments").upsert(
      {
        event_id: match.event.eventId,
        league_id: input.referenceLeagueId,
        season: typeof input.seasons[0] === "number" ? (input.seasons[0] as number) : null,
        xg_home: xgHome,
        xg_away: xgAway,
        payload: { source: "Understat", row },
        synced_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    );
    linked += 1;
  }

  return { linked };
}

async function fetchMatchHistoryGames(input: {
  league: string;
  seasons: Array<string | number>;
}): Promise<SoccerdataDataFrame> {
  const primary = String(input.seasons[0] ?? "");
  const candidates =
    primary && /^\d{4}$/.test(primary)
      ? matchHistorySeasonCandidates(primary)
      : input.seasons.map(String);

  let lastError: UpstreamApiError | null = null;
  for (const seasonCode of candidates) {
    try {
      const res = await fetchSoccerdata({
        source: "MatchHistory",
        method: "read_games",
        constructor: { leagues: [input.league], seasons: [seasonCode] },
        persist: true,
      });
      return asDataFrame(res.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isMatchHistoryDownloadError(message)) throw error;
      lastError =
        error instanceof UpstreamApiError
          ? error
          : new UpstreamApiError(message);
    }
  }

  throw (
    lastError ??
    new UpstreamApiError(
      `MatchHistory could not download CSV for seasons: ${candidates.join(", ")}.`
    )
  );
}

export async function importMatchHistoryOddsToCanonical(input: {
  referenceLeagueId: number;
  seasons: Array<string | number>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");

  const league = soccerdataLeagueIdForReference("MatchHistory", input.referenceLeagueId);
  if (!league) {
    throw new UpstreamApiError(
      `No MatchHistory league mapping configured for referenceLeagueId=${input.referenceLeagueId}.`
    );
  }

  const df = await fetchMatchHistoryGames({ league, seasons: input.seasons });
  const events = await loadCanonicalEvents(input.referenceLeagueId);

  let linked = 0;
  for (const row of df.records) {
    const kickoffIso = toIso(row.date ?? row.kickoff_at ?? row.datetime);
    const home = pickString(row, ["HomeTeam", "home", "home_team", "team_home"]);
    const away = pickString(row, ["AwayTeam", "away", "away_team", "team_away"]);
    if (!kickoffIso || !home || !away) continue;

    const match = findBestEventMatch({ events, kickoffIso, homeName: home, awayName: away });
    if (!match) continue;

    // Common columns: B365H/B365D/B365A, or other bookmaker prefixes.
    const oddsHome =
      pickNumber(row, ["B365H", "BWH", "PSH", "VCH", "IWH", "WHH", "LBH"]) ??
      pickNumber(row, ["odds_home"]);
    const oddsDraw =
      pickNumber(row, ["B365D", "BWD", "PSD", "VCD", "IWD", "WHD", "LBD"]) ??
      pickNumber(row, ["odds_draw"]);
    const oddsAway =
      pickNumber(row, ["B365A", "BWA", "PSA", "VCA", "IWA", "WHA", "LBA"]) ??
      pickNumber(row, ["odds_away"]);

    const key = `MatchHistory:${input.referenceLeagueId}:${normalizeText(kickoffIso)}:${normalizeText(home)}:${normalizeText(away)}`;
    await supabase.from("soccerdata_match_links").upsert(
      {
        event_id: match.event.eventId,
        league_id: input.referenceLeagueId,
        source: "MatchHistory",
        soccerdata_match_key: key,
        kickoff_at: kickoffIso,
        home_team_id: match.event.homeTeamId,
        away_team_id: match.event.awayTeamId,
        confidence: match.confidence,
        linked_by: "date+home+away",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,source" }
    );

    await supabase.from("soccerdata_event_enrichments").upsert(
      {
        event_id: match.event.eventId,
        league_id: input.referenceLeagueId,
        season: typeof input.seasons[0] === "number" ? (input.seasons[0] as number) : null,
        odds_home: oddsHome,
        odds_draw: oddsDraw,
        odds_away: oddsAway,
        payload: { source: "MatchHistory", row },
        synced_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    );
    linked += 1;
  }

  return { linked };
}

