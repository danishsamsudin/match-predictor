import { NextResponse } from "next/server";
import { runSoccerdataLeagueBackfill } from "@/lib/soccerdata/run-league-backfill";
import { UpstreamApiError } from "@/lib/types/prediction";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    return NextResponse.json(
      { ok: false, message: "Body must include leagueId (number), e.g. 39 for Premier League." },
      { status: 400 }
    );
  }

  const season = input.season != null ? Number(input.season) : undefined;
  if (season != null && !Number.isFinite(season)) {
    return NextResponse.json({ ok: false, message: "season must be a number if provided." }, { status: 400 });
  }

  const steps =
    input.steps && typeof input.steps === "object"
      ? (input.steps as Record<string, unknown>)
      : undefined;

  try {
    const result = await runSoccerdataLeagueBackfill({
      referenceLeagueId: leagueId,
      season,
      forceCache: Boolean(input.forceCache),
      steps: steps
        ? {
            fixtures: steps.fixtures !== false,
            understatXg: steps.understatXg !== false,
            matchHistoryOdds: steps.matchHistoryOdds !== false,
            players: steps.players !== false,
          }
        : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof UpstreamApiError ? error.message : "SoccerData league backfill failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
