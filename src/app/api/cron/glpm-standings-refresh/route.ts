import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  isGlpmCronAuthorized,
  parseBoolQuery,
  parseSeasonIdsParam,
} from "@/lib/glpm/sportmonks/cronRoute";
import { refreshGlpmStandings } from "@/lib/glpm/refresh-standings";

export const runtime = "nodejs";
export const maxDuration = 120;

async function run(request: NextRequest) {
  const seasonIds = parseSeasonIdsParam(request);
  const dryRun = parseBoolQuery(request, "dryRun");
  const writeSnapshot = request.nextUrl.searchParams.get("noSnapshot") !== "true";
  const triggerParam = request.nextUrl.searchParams.get("trigger");
  const trigger =
    triggerParam === "github" ||
    triggerParam === "cron" ||
    triggerParam === "manual" ||
    triggerParam === "cli" ||
    triggerParam === "schedule_refresh"
      ? triggerParam
      : "cron";

  const client = createServiceClient();
  return refreshGlpmStandings(client, {
    seasonIds,
    trigger,
    writeSnapshot,
    dryRun,
  });
}

export async function POST(request: NextRequest) {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await run(request);
    return NextResponse.json(result);
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
    return NextResponse.json({
      hint: "GET /api/cron/glpm-standings-refresh?run=true&seasonIds=28083,27958,...",
      notes: [
        "Call after SportMonks schedule/score refresh so previous_rank updates when results change.",
        "Unchanged results fingerprints keep previous_rank (arrows stay stable on no-op runs).",
        "Future GitHub Action: POST schedules refresh, then POST this endpoint with trigger=github.",
      ],
    });
  }

  try {
    const result = await run(request);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
