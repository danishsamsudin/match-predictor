import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { runGlpmUpcomingPredictionSnapshots } from "@/lib/glpm/run-upcoming-prediction-snapshots";

export const runtime = "nodejs";
export const maxDuration = 300;

function resolveCronSecret(): string | undefined {
  return getSyncCronSecret() ?? (process.env.CRON_SECRET?.trim() || undefined);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = resolveCronSecret();
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? querySecret;
  return provided === secret;
}

async function run(request: NextRequest) {
  const maxRaw = request.nextUrl.searchParams.get("maxPerCompetition");
  const maxPerCompetition = maxRaw ? Number(maxRaw) : undefined;
  const force = request.nextUrl.searchParams.get("force") === "true";

  const result = await runGlpmUpcomingPredictionSnapshots({
    maxPerCompetition:
      maxPerCompetition != null && Number.isFinite(maxPerCompetition)
        ? maxPerCompetition
        : undefined,
    force,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(request);
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({
      ok: true,
      message:
        "POST or GET ?run=true with cron secret to precompute GLPM upcoming card predictions",
    });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(request);
}
