import { cachedFetch, TTL } from "@/lib/cache/api-cache";
import {
  ODDS_CACHE_TTL_MS,
  ODDS_DAILY_CREDIT_LIMIT,
  sportKeyForLeagueSmId,
} from "@/lib/odds-api/config";
import {
  fetchEventExtraOdds,
  fetchLeagueFeaturedOdds,
  hasOddsApiKey,
  type OddsApiQuota,
} from "@/lib/odds-api/client";
import { findMatchingEvent } from "@/lib/odds-api/match-teams";
import { mapEventToValueRows, rowsToBookMaps } from "@/lib/odds-api/select-best";
import type { MatchOddsResult, OddsApiEvent, OddsApiBookmaker } from "@/lib/odds-api/types";

type CachedLeagueOdds = {
  events: OddsApiEvent[];
  quota: OddsApiQuota;
  fetchedAt: string;
};

type CachedEventExtras = {
  event: OddsApiEvent;
  quota: OddsApiQuota;
  fetchedAt: string;
};

function emptyResult(partial: Partial<MatchOddsResult> & { message: string }): MatchOddsResult {
  return {
    matched: false,
    sportKey: null,
    eventId: null,
    homeTeam: null,
    awayTeam: null,
    commenceTime: null,
    rows: [],
    bookByRowId: {},
    sourceByRowId: {},
    fromCache: false,
    creditsUsedThisCall: 0,
    requestsRemaining: null,
    requestsUsed: null,
    fetchedAt: null,
    ...partial,
  };
}

function mergeBookmakers(
  base: OddsApiEvent,
  extra: OddsApiEvent | null
): OddsApiEvent {
  if (!extra?.bookmakers?.length) return base;

  const byKey = new Map<string, OddsApiBookmaker>();
  for (const b of base.bookmakers ?? []) {
    byKey.set(b.key, {
      ...b,
      markets: [...(b.markets ?? [])],
    });
  }
  for (const b of extra.bookmakers) {
    const existing = byKey.get(b.key);
    if (!existing) {
      byKey.set(b.key, { ...b, markets: [...(b.markets ?? [])] });
      continue;
    }
    const marketKeys = new Set(existing.markets.map((m) => m.key));
    for (const m of b.markets ?? []) {
      if (!marketKeys.has(m.key)) {
        existing.markets.push(m);
        marketKeys.add(m.key);
      }
    }
  }
  return {
    ...base,
    bookmakers: [...byKey.values()],
  };
}

async function loadLeagueOdds(sportKey: string): Promise<{
  payload: CachedLeagueOdds;
  fromCache: boolean;
  credits: number;
}> {
  const result = await cachedFetch<CachedLeagueOdds>({
    provider: "odds",
    cacheKey: `odds:league:${sportKey}:h2h-totals:v2`,
    ttlMs: ODDS_CACHE_TTL_MS,
    dailyLimit: ODDS_DAILY_CREDIT_LIMIT,
    fetcher: async () => {
      const { data, quota } = await fetchLeagueFeaturedOdds(sportKey);
      return {
        events: data,
        quota,
        fetchedAt: new Date().toISOString(),
      };
    },
  });

  const credits = result.fromCache ? 0 : (result.data.quota.last ?? 0);
  return { payload: result.data, fromCache: result.fromCache, credits };
}

async function loadEventExtras(
  sportKey: string,
  eventId: string
): Promise<{
  payload: CachedEventExtras | null;
  fromCache: boolean;
  credits: number;
}> {
  try {
    const result = await cachedFetch<CachedEventExtras>({
      provider: "odds",
      cacheKey: `odds:event:${sportKey}:${eventId}:btts`,
      ttlMs: ODDS_CACHE_TTL_MS,
      dailyLimit: ODDS_DAILY_CREDIT_LIMIT,
      fetcher: async () => {
        const { data, quota } = await fetchEventExtraOdds(sportKey, eventId);
        return {
          event: data,
          quota,
          fetchedAt: new Date().toISOString(),
        };
      },
    });
    const credits = result.fromCache ? 0 : (result.data.quota.last ?? 0);
    return { payload: result.data, fromCache: result.fromCache, credits };
  } catch {
    // BTTS is optional - featured 1X2 / totals still useful.
    return { payload: null, fromCache: false, credits: 0 };
  }
}

export type GetMatchOddsInput = {
  leagueSmId: number;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso?: string | null;
  /** When false, skip the paid BTTS event call. Default true. */
  includeExtras?: boolean;
};

/**
 * Resolve Pinnacle / Unibet NL odds for a GLPM fixture and map to Value Opportunities rows.
 * Credit strategy: league featured odds cached 8h (covers all fixtures); BTTS per event cached 8h.
 */
export async function getMatchValueOdds(
  input: GetMatchOddsInput
): Promise<MatchOddsResult> {
  if (!hasOddsApiKey()) {
    return emptyResult({
      message:
        "Odds auto-fill is offline until THE_ODDS_API_KEY is set (free key at the-odds-api.com).",
    });
  }

  const sportKey = sportKeyForLeagueSmId(input.leagueSmId);
  if (!sportKey) {
    return emptyResult({
      message: "This league is not covered by The Odds API integration.",
    });
  }

  let creditsUsed = 0;
  let fromCache = true;
  let remaining: number | null = null;
  let used: number | null = null;

  const league = await loadLeagueOdds(sportKey);
  creditsUsed += league.credits;
  fromCache = fromCache && league.fromCache;
  remaining = league.payload.quota.remaining;
  used = league.payload.quota.used;

  const match = findMatchingEvent(
    league.payload.events,
    input.homeTeamName,
    input.awayTeamName,
    input.kickoffIso
  );

  if (!match) {
    return emptyResult({
      sportKey,
      fromCache,
      creditsUsedThisCall: creditsUsed,
      requestsRemaining: remaining,
      requestsUsed: used,
      fetchedAt: league.payload.fetchedAt,
      message: `No upcoming Odds API fixture matched ${input.homeTeamName} vs ${input.awayTeamName} in the next ~36 hours.`,
    });
  }

  let event = match.event;
  if (input.includeExtras !== false) {
    const extras = await loadEventExtras(sportKey, event.id);
    creditsUsed += extras.credits;
    fromCache = fromCache && (extras.fromCache || extras.payload == null);
    if (extras.payload) {
      remaining = extras.payload.quota.remaining ?? remaining;
      used = extras.payload.quota.used ?? used;
      event = mergeBookmakers(event, extras.payload.event);
    }
  }

  const rows = mapEventToValueRows(event);
  const { bookByRowId, sourceByRowId } = rowsToBookMaps(rows);

  if (!rows.length) {
    return emptyResult({
      matched: true,
      sportKey,
      eventId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      fromCache,
      creditsUsedThisCall: creditsUsed,
      requestsRemaining: remaining,
      requestsUsed: used,
      fetchedAt: league.payload.fetchedAt,
      message: "Matched the fixture but Pinnacle / Unibet returned no usable prices yet.",
    });
  }

  return {
    matched: true,
    sportKey,
    eventId: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time,
    rows,
    bookByRowId,
    sourceByRowId,
    fromCache,
    creditsUsedThisCall: creditsUsed,
    requestsRemaining: remaining,
    requestsUsed: used,
    fetchedAt: league.payload.fetchedAt,
    message: null,
  };
}

/** Warm featured odds for a sport (used by cron). Returns credits spent. */
export async function warmLeagueOdds(sportKey: string): Promise<{
  credits: number;
  eventCount: number;
  fromCache: boolean;
  remaining: number | null;
}> {
  if (!hasOddsApiKey()) {
    return { credits: 0, eventCount: 0, fromCache: false, remaining: null };
  }
  const league = await loadLeagueOdds(sportKey);
  return {
    credits: league.credits,
    eventCount: league.payload.events.length,
    fromCache: league.fromCache,
    remaining: league.payload.quota.remaining,
  };
}

// Re-export TTL alias for clarity in cron/docs
export const ODDS_TTL = TTL;
