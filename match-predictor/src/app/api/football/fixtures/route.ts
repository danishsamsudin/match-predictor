import { NextRequest, NextResponse } from "next/server";
import { lookupFixtures } from "@/lib/api/football-lookup";
import { RateLimitError, UpstreamApiError } from "@/lib/types/prediction";

export async function GET(request: NextRequest) {
  const leagueId = Number(request.nextUrl.searchParams.get("league"));
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ error: "Missing or invalid league parameter" }, { status: 400 });
  }

  try {
    const { fixtures, source } = await lookupFixtures(leagueId);
    return NextResponse.json({ fixtures, source });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof UpstreamApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Failed to load fixtures:", error);
    return NextResponse.json({ error: "Failed to load fixtures" }, { status: 500 });
  }
}
