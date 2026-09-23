import { NextRequest, NextResponse } from "next/server";
import { refreshNationsLeagueHubSnapshot } from "@/lib/nations-league/hub-load";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
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
  try {
    const payload = await refreshNationsLeagueHubSnapshot();
    return NextResponse.json({ ok: true, updatedAt: payload?.updatedAt ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "NL cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({
      ok: true,
      message: "POST with cron secret to run nations-league hub refresh",
    });
  }
  return POST(request);
}
