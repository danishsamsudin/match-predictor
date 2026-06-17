import { NextResponse } from "next/server";
import { importFixturesFromFbref } from "@/lib/soccerdata/import-fixtures";
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
  const seasons = Array.isArray(input.seasons) ? input.seasons : [];
  if (!Number.isFinite(leagueId) || seasons.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Body must include leagueId (number) and seasons (array)." },
      { status: 400 }
    );
  }

  try {
    const result = await importFixturesFromFbref({
      referenceLeagueId: leagueId,
      seasons: seasons as Array<string | number>,
      force: Boolean(input.force),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError ? error.message : "SoccerData fixture import failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

