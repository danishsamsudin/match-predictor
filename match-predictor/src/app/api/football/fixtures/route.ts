import { NextRequest, NextResponse } from "next/server";
import { lookupFixtures } from "@/lib/api/football-lookup";
import { sanitizeUserFacingMessage } from "@/lib/api/user-facing-messages";
import { RateLimitError, UpstreamApiError } from "@/lib/types/prediction";

export async function GET(request: NextRequest) {
  const leagueId = Number(request.nextUrl.searchParams.get("league"));
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ error: "Missing or invalid league parameter" }, { status: 400 });
  }

  try {
    const { fixtures, source, message } = await lookupFixtures(leagueId);
    return NextResponse.json({
      fixtures,
      source,
      message: sanitizeUserFacingMessage(message) ?? undefined,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ fixtures: [], source: "live" as const });
    }
    if (error instanceof UpstreamApiError) {
      const message = sanitizeUserFacingMessage(error.message);
      if (!message) {
        return NextResponse.json({ fixtures: [], source: "live" as const });
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
    console.error("Failed to load fixtures:", error);
    return NextResponse.json({ error: "Failed to load fixtures" }, { status: 500 });
  }
}
