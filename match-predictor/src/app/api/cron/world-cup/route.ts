import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { runWorldCupHubRefresh } from "@/lib/world-cup/hub-refresh";

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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWorldCupHubRefresh("cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({ ok: true, message: "POST with cron secret to run world-cup sync" });
  }
  return POST(request);
}
