import { NextRequest, NextResponse } from "next/server";
import { isGlpmCronAuthorized } from "@/lib/glpm/sportmonks/cronRoute";
import { ODDS_SPORT_BY_LEAGUE_SM_ID } from "@/lib/odds-api/config";
import { fetchOddsEvents, hasOddsApiKey } from "@/lib/odds-api/client";
import { warmLeagueOdds } from "@/lib/odds-api/get-match-odds";

export const runtime = "nodejs";
export const maxDuration = 60;

const HINT =
  "GET|POST /api/cron/odds-api-warm?run=true — warms The Odds API featured odds (Pinnacle + Unibet NL) for GLPM leagues with fixtures in the next ~36h. Free /events probe first; paid /odds only when needed.";

/**
 * Day-before / day-of warm: only spend credits on leagues that actually have
 * upcoming fixtures. Cached 8h so Value Opportunities opens are usually free.
 */
async function runWarm() {
  if (!hasOddsApiKey()) {
    return {
      ok: false,
      error: "THE_ODDS_API_KEY is not set",
      leagues: [] as unknown[],
      creditsSpent: 0,
    };
  }

  const leagues: Array<{
    sportKey: string;
    leagueSmId: number;
    upcomingEvents: number;
    warmed: boolean;
    fromCache: boolean;
    credits: number;
    eventCount: number;
    remaining: number | null;
  }> = [];

  let creditsSpent = 0;

  for (const [leagueSmIdRaw, sportKey] of Object.entries(ODDS_SPORT_BY_LEAGUE_SM_ID)) {
    const leagueSmId = Number(leagueSmIdRaw);
    const events = await fetchOddsEvents(sportKey);
    const upcomingEvents = events.data.length;

    if (upcomingEvents === 0) {
      leagues.push({
        sportKey,
        leagueSmId,
        upcomingEvents: 0,
        warmed: false,
        fromCache: false,
        credits: 0,
        eventCount: 0,
        remaining: events.quota.remaining,
      });
      continue;
    }

    const warmed = await warmLeagueOdds(sportKey);
    creditsSpent += warmed.credits;
    leagues.push({
      sportKey,
      leagueSmId,
      upcomingEvents,
      warmed: true,
      fromCache: warmed.fromCache,
      credits: warmed.credits,
      eventCount: warmed.eventCount,
      remaining: warmed.remaining,
    });
  }

  return {
    ok: true,
    creditsSpent,
    leagues,
    note: "Featured markets cost ~1–2 credits per league when cache misses. Empty leagues skip paid calls.",
  };
}

export async function POST(request: NextRequest) {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWarm();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odds warm failed";
    return NextResponse.json({ error: message, hint: HINT }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", hint: HINT }, { status: 401 });
  }
  const run = request.nextUrl.searchParams.get("run");
  if (run !== "true") {
    return NextResponse.json({ hint: HINT });
  }
  try {
    const result = await runWarm();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odds warm failed";
    return NextResponse.json({ error: message, hint: HINT }, { status: 500 });
  }
}
