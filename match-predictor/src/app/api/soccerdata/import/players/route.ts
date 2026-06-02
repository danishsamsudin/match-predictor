import { NextResponse } from "next/server";
import { importPlayersFromSofifa } from "@/lib/soccerdata/import-players";
import { UpstreamApiError } from "@/lib/types/prediction";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const leagueId = Number(input.leagueId);
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ ok: false, message: "Body must include leagueId (number)." }, { status: 400 });
  }

  try {
    const result = await importPlayersFromSofifa({
      referenceLeagueId: leagueId,
      version: typeof input.version === "string" || typeof input.version === "number" ? input.version : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof UpstreamApiError ? error.message : "SoccerData player import failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

