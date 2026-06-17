import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret, isSupabaseDataStore } from "@/lib/config/data-source";
import { getSyncStatus } from "@/lib/data/football-store";
import { runFootballDataSync } from "@/lib/sync/run-football-sync";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  if (!isSupabaseDataStore()) {
    return NextResponse.json(
      {
        error:
          "Set DATA_SOURCE=supabase in .env.local so the app reads from the database instead of live APIs.",
      },
      { status: 400 }
    );
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const result = await runFootballDataSync({ force });
  const status = await getSyncStatus();

  return NextResponse.json({
    ...result,
    syncStatus: status,
  });
}

/** Status check, or run sync when called by Vercel Cron (GET + Bearer secret). */
export async function GET(request: NextRequest) {
  const status = await getSyncStatus();

  if (isAuthorized(request) && request.nextUrl.searchParams.get("run") === "true") {
    if (!isSupabaseDataStore()) {
      return NextResponse.json({
        dataSource: "live",
        ...status,
        error: "Set DATA_SOURCE=supabase to enable scheduled sync",
      });
    }
    const force = request.nextUrl.searchParams.get("force") === "true";
    const result = await runFootballDataSync({ force });
    return NextResponse.json({ ...result, syncStatus: status });
  }

  return NextResponse.json({
    dataSource: isSupabaseDataStore() ? "supabase" : "live",
    ...status,
    hint: "POST /api/cron/sync?force=true with Authorization: Bearer <SYNC_CRON_SECRET> to sync now",
  });
}
