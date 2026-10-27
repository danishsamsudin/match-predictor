import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { runGlpmHomeCardSync } from "@/lib/glpm/home-card-sync";

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
  const skipVerify = request.nextUrl.searchParams.get("skipVerify") === "true";

  const result = await runGlpmHomeCardSync({
    maxPerCompetition:
      maxPerCompetition != null && Number.isFinite(maxPerCompetition)
        ? maxPerCompetition
        : 24,
    force,
    skipVerify,
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
        "POST or GET ?run=true with cron secret to force-refresh GLPM-CX upcoming card predictions, rebuild home hub packs, and verify they match",
    });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(request);
}
