import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret, isSupabaseDataStore } from "@/lib/config/data-source";
import { runLeaguePredictionSnapshots } from "@/lib/prediction/run-league-prediction-snapshots";

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

  if (!isSupabaseDataStore()) {
    return NextResponse.json(
      {
        error:
          "Set DATA_SOURCE=supabase so league snapshots read synced bundles without live API calls.",
      },
      { status: 400 }
    );
  }

  const snapshotDate =
    request.nextUrl.searchParams.get("date")?.trim().slice(0, 10) || undefined;

  const result = await runLeaguePredictionSnapshots({ snapshotDate });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({
      ok: true,
      message: "POST with cron secret to run daily league prediction snapshots",
    });
  }
  return POST(request);
}
