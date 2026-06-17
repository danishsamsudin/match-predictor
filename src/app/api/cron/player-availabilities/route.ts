import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { runPlayerAvailabilitySync } from "@/lib/data/sync-player-availabilities";
import { tryCreateServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
  const secret = getSyncCronSecret() ?? process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? querySecret;
  return provided === secret;
}

export async function GET(request: NextRequest) {
  const csvPath = process.env.AVAILABILITY_CSV_PATH?.trim();
  const fetchUrl = process.env.AVAILABILITY_SCRAPE_URL?.trim();

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({
      hint: "GET /api/cron/player-availabilities?run=true with cron secret, or POST to run sync.",
      csvPath: csvPath ?? null,
      fetchUrl: fetchUrl ? "(configured)" : null,
    });
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const summary = await runPlayerAvailabilitySync(supabase, {
      csvPath: csvPath || undefined,
      fetchUrl: fetchUrl || undefined,
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    csvPath?: string;
    fetchUrl?: string;
  };

  try {
    const summary = await runPlayerAvailabilitySync(supabase, {
      csvPath: body.csvPath ?? process.env.AVAILABILITY_CSV_PATH?.trim(),
      fetchUrl: body.fetchUrl ?? process.env.AVAILABILITY_SCRAPE_URL?.trim(),
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
