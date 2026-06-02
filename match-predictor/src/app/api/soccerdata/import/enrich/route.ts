import { NextResponse } from "next/server";
import {
  importMatchHistoryOddsToCanonical,
  importUnderstatXgToCanonical,
} from "@/lib/soccerdata/import-enrichments";
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
  const seasons = Array.isArray(input.seasons) ? (input.seasons as Array<string | number>) : [];
  const kind = typeof input.kind === "string" ? input.kind : "";

  if (!Number.isFinite(leagueId) || seasons.length === 0 || !kind) {
    return NextResponse.json(
      { ok: false, message: "Body must include kind ('understat_xg'|'matchhistory_odds'), leagueId, seasons." },
      { status: 400 }
    );
  }

  try {
    const result =
      kind === "understat_xg"
        ? await importUnderstatXgToCanonical({ referenceLeagueId: leagueId, seasons })
        : kind === "matchhistory_odds"
          ? await importMatchHistoryOddsToCanonical({ referenceLeagueId: leagueId, seasons })
          : null;

    if (!result) {
      return NextResponse.json({ ok: false, message: `Unknown kind: ${kind}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError ? error.message : "SoccerData enrichment import failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

