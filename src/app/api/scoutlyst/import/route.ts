import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { importScoutlystCsv } from "@/lib/scoutlyst/import-scoutlyst-csv";
import { UpstreamApiError } from "@/lib/types/prediction";

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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let csvText: string;
  let fileName = "upload.csv";
  let snapshotDate: string | undefined;
  let referenceLeagueId: number | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "multipart body must include a file field." }, { status: 400 });
    }
    csvText = await file.text();
    fileName = file.name || fileName;
    const snap = form.get("snapshotDate");
    if (typeof snap === "string" && snap.trim()) snapshotDate = snap.trim();
    const league = form.get("leagueId");
    if (league != null && String(league).trim()) {
      const n = Number(league);
      if (Number.isFinite(n)) referenceLeagueId = n;
    }
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Send multipart file=... or JSON { csv, fileName?, snapshotDate?, leagueId? }." },
        { status: 400 }
      );
    }
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (typeof input.csv !== "string" || !input.csv.trim()) {
      return NextResponse.json({ error: "JSON body must include csv (string)." }, { status: 400 });
    }
    csvText = input.csv;
    if (typeof input.fileName === "string") fileName = input.fileName;
    if (typeof input.snapshotDate === "string") snapshotDate = input.snapshotDate;
    if (input.leagueId != null && Number.isFinite(Number(input.leagueId))) {
      referenceLeagueId = Number(input.leagueId);
    }
  }

  try {
    const result = await importScoutlystCsv({
      csvText,
      fileName,
      snapshotDate,
      referenceLeagueId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof UpstreamApiError ? error.message : "Scoutlyst import failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
