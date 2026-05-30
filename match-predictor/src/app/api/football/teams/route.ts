import { NextRequest, NextResponse } from "next/server";
import { lookupTeams } from "@/lib/api/football-lookup";

export async function GET(request: NextRequest) {
  const leagueId = Number(request.nextUrl.searchParams.get("league"));
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ error: "Missing or invalid league parameter" }, { status: 400 });
  }

  try {
    const teams = await lookupTeams(leagueId);
    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Failed to load teams:", error);
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
  }
}
