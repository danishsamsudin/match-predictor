import { NextRequest, NextResponse } from "next/server";
import {
  isGlpmCronAuthorized,
  parseBoolQuery,
} from "@/lib/glpm/sportmonks/cronRoute";
import { refreshUpcomingFixtureTimes } from "@/lib/glpm/sportmonks/refreshUpcomingTimes";
import { runGlpmMissingUpcomingPredictionCatchUp } from "@/lib/glpm/run-upcoming-prediction-snapshots";
import { refreshGlpmHomeHubPacks } from "@/lib/glpm/home-hub-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

const HINT =
  "GET|POST /api/cron/glpm-upcoming-kickoffs?run=true — refreshes SportMonks kickoff times for the next week of GLPM fixtures, catch-up CX snapshots for missing cards, then rebuilds home hub packs.";

async function run(request: NextRequest) {
  const skipCatchUp = parseBoolQuery(request, "skipCatchUp");
  const times = await refreshUpcomingFixtureTimes();
  const catchUp = skipCatchUp
    ? null
    : await runGlpmMissingUpcomingPredictionCatchUp({ maxPerCompetition: 24 });
  const packs = await refreshGlpmHomeHubPacks();
  const ok =
    times.failed === 0 &&
    (catchUp == null || catchUp.ok) &&
    packs.ok;
  return {
    ok,
    kickoffs: times,
    catchUp,
    homeHubPacks: packs,
  };
}

export async function POST(request: NextRequest) {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await run(request);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({ hint: HINT });
  }

  try {
    const result = await run(request);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
