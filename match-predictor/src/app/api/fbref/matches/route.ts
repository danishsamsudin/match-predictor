import { NextResponse } from "next/server";
import {
  fbrefStoreAvailable,
  listFbrefTeams,
  listFbrefWorldCupMatches,
} from "@/lib/fbref/supabase-store";

export async function GET() {
  if (!fbrefStoreAvailable()) {
    return NextResponse.json(
      {
        error:
          "Supabase service role not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 503 }
    );
  }
  try {
    const [matches, teams] = await Promise.all([
      listFbrefWorldCupMatches(),
      listFbrefTeams(),
    ]);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    return NextResponse.json({
      matches: matches.map((m) => ({
        ...m,
        home_team_name: m.home_team_id ? names.get(m.home_team_id) : null,
        away_team_name: m.away_team_id ? names.get(m.away_team_id) : null,
      })),
      count: matches.length,
    });
  } catch (error) {
    console.error("fbref matches:", error);
    return NextResponse.json({ error: "Failed to load FBref matches" }, { status: 500 });
  }
}
