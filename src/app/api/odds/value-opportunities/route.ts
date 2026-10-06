import { NextResponse } from "next/server";
import { getMatchValueOdds } from "@/lib/odds-api/get-match-odds";
import { isSupportedOddsLeague } from "@/lib/odds-api/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/odds/value-opportunities
 * ?leagueSmId=&home=&away=&kickoff=optional ISO
 *
 * Returns Pinnacle/Unibet NL prices mapped to Value Opportunities row ids.
 * Prefers Pinnacle unless Unibet is strictly longer on that selection.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueSmId = Number(searchParams.get("leagueSmId"));
    const home = searchParams.get("home")?.trim() ?? "";
    const away = searchParams.get("away")?.trim() ?? "";
    const kickoff = searchParams.get("kickoff");
    const includeExtras = searchParams.get("extras") !== "0";

    if (!Number.isFinite(leagueSmId) || !isSupportedOddsLeague(leagueSmId)) {
      return NextResponse.json(
        {
          error:
            "leagueSmId must be one of our five leagues (Premier League, Eredivisie, Bundesliga, Serie A, Championship).",
        },
        { status: 400 }
      );
    }
    if (!home || !away) {
      return NextResponse.json(
        { error: "home and away team names are required" },
        { status: 400 }
      );
    }

    const result = await getMatchValueOdds({
      leagueSmId,
      homeTeamName: home,
      awayTeamName: away,
      kickoffIso: kickoff,
      includeExtras,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odds fetch failed";
    const status = message.includes("THE_ODDS_API_KEY")
      ? 503
      : message.includes("Daily odds API limit")
        ? 429
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
