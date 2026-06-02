import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { discoverPendingCsvFiles, summarizePendingByLeague } from "@/lib/scoutlyst/discover-import-files";
import { SCOUTLYST_INCOMING_DIR } from "@/lib/scoutlyst/league-folder-config";
import { runScoutlystFolderImport } from "@/lib/scoutlyst/run-folder-import";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = getSyncCronSecret() ?? process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? querySecret;
  return provided === secret;
}

/** Import all CSV files under data/imports/scoutlyst/incoming/ (including per-league subfolders). */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowUnmapped = request.nextUrl.searchParams.get("allowUnmapped") === "true";
  const summary = await runScoutlystFolderImport({ allowUnmappedLeagues: allowUnmapped });
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  const pending = discoverPendingCsvFiles();
  const byLeague = summarizePendingByLeague(pending);

  if (isAuthorized(request) && request.nextUrl.searchParams.get("run") === "true") {
    const allowUnmapped = request.nextUrl.searchParams.get("allowUnmapped") === "true";
    const summary = await runScoutlystFolderImport({ allowUnmappedLeagues: allowUnmapped });
    return NextResponse.json(summary);
  }

  return NextResponse.json({
    pendingCount: pending.length,
    byLeague,
    importDir: SCOUTLYST_INCOMING_DIR,
    hint:
      "Organize exports as incoming/<league-folder>/*.csv (e.g. incoming/premier-league/). Map folders in data/imports/scoutlyst/league-folders.json. Then POST /api/cron/scoutlyst-import with Bearer SYNC_CRON_SECRET.",
  });
}
