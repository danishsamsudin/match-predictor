import {
  ODDS_BOOKMAKERS,
  ODDS_EVENT_EXTRA_MARKETS,
  ODDS_FEATURED_MARKETS,
  ODDS_LOOKAHEAD_HOURS,
  ODDS_LOOKBACK_HOURS,
} from "@/lib/odds-api/config";
import type { OddsApiEvent } from "@/lib/odds-api/types";

const HOST = "https://api.the-odds-api.com";

export type OddsApiQuota = {
  remaining: number | null;
  used: number | null;
  last: number | null;
};

export type OddsApiFetchResult<T> = {
  data: T;
  quota: OddsApiQuota;
};

function getApiKey(): string {
  const key = process.env.THE_ODDS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "THE_ODDS_API_KEY is not set. Add your free key from https://the-odds-api.com/"
    );
  }
  return key;
}

function parseQuota(res: Response): OddsApiQuota {
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  const last = res.headers.get("x-requests-last");
  return {
    remaining: remaining != null ? Number(remaining) : null,
    used: used != null ? Number(used) : null,
    last: last != null ? Number(last) : null,
  };
}

function windowIsoRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getTime() - ODDS_LOOKBACK_HOURS * 3_600_000);
  const to = new Date(now.getTime() + ODDS_LOOKAHEAD_HOURS * 3_600_000);
  return { from: from.toISOString().replace(/\.\d{3}Z$/, "Z"), to: to.toISOString().replace(/\.\d{3}Z$/, "Z") };
}

async function oddsGet<T>(path: string, params: Record<string, string>): Promise<OddsApiFetchResult<T>> {
  const url = new URL(`${HOST}${path}`);
  url.searchParams.set("apiKey", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const quota = parseQuota(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `The Odds API ${res.status}: ${body.slice(0, 240) || res.statusText}`
    );
  }

  const data = (await res.json()) as T;
  return { data, quota };
}

/** Free: list upcoming events (no odds). */
export async function fetchOddsEvents(sportKey: string): Promise<OddsApiFetchResult<OddsApiEvent[]>> {
  const { from, to } = windowIsoRange();
  return oddsGet<OddsApiEvent[]>(`/v4/sports/${sportKey}/events`, {
    commenceTimeFrom: from,
    commenceTimeTo: to,
  });
}

/**
 * Paid: featured odds for a whole sport/league.
 * Cost ≈ (# markets returned) × 1 (bookmakers group).
 */
export async function fetchLeagueFeaturedOdds(
  sportKey: string
): Promise<OddsApiFetchResult<OddsApiEvent[]>> {
  const { from, to } = windowIsoRange();
  return oddsGet<OddsApiEvent[]>(`/v4/sports/${sportKey}/odds`, {
    bookmakers: ODDS_BOOKMAKERS,
    markets: ODDS_FEATURED_MARKETS,
    oddsFormat: "decimal",
    dateFormat: "iso",
    commenceTimeFrom: from,
    commenceTimeTo: to,
  });
}

/**
 * Paid: extra markets for one event (BTTS).
 * Cost ≈ (# markets returned) × 1.
 */
export async function fetchEventExtraOdds(
  sportKey: string,
  eventId: string
): Promise<OddsApiFetchResult<OddsApiEvent>> {
  return oddsGet<OddsApiEvent>(`/v4/sports/${sportKey}/events/${eventId}/odds`, {
    bookmakers: ODDS_BOOKMAKERS,
    markets: ODDS_EVENT_EXTRA_MARKETS,
    oddsFormat: "decimal",
    dateFormat: "iso",
  });
}

export function hasOddsApiKey(): boolean {
  return Boolean(process.env.THE_ODDS_API_KEY?.trim());
}
