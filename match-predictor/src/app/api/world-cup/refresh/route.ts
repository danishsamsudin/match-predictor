import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { loadHubSnapshotMeta } from "@/lib/world-cup/hub-snapshot";
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

/** Refresh status + cooldown for the hub refresh button. */
export async function GET() {
  const meta = await loadHubSnapshotMeta();
  return NextResponse.json(meta);
}

/** Manual hub refresh (10-minute cooldown). Optional cron secret for scripted runs. */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWorldCupHubRefresh("manual");

  if (!result.ok && result.retryAfterSeconds) {
    return NextResponse.json(
      {
        error: result.errors[0] ?? "Refresh not allowed",
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  if (result.errors.some((e) => e.includes("already in progress"))) {
    return NextResponse.json(
      { error: result.errors[0] },
      { status: 409 }
    );
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
