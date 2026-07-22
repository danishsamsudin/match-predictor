import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  isGlpmCronAuthorized,
  parseBoolQuery,
} from "@/lib/glpm/sportmonks/cronRoute";
import { syncInplayLivescores } from "@/lib/glpm/live-scores/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const HINT =
  "GET|POST /api/cron/glpm-livescores?run=true — polls SportMonks /livescores/inplay for GLPM leagues when fixtures are in the live window. Optional: force=true to skip the window gate.";

async function run(request: NextRequest) {
  const force = parseBoolQuery(request, "force");
  const client = createServiceClient();
  return syncInplayLivescores(client, { force });
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
      hint: HINT,
      notes: [
        "Designed for cron-job.org every 60s during match windows.",
        "When no GLPM fixtures are in the local live poll window, the handler returns skipped=true and does not call SportMonks.",
        "Use force=true only for manual smoke tests.",
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
