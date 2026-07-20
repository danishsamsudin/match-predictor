import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

/**
 * List GLPM teams, optionally filtered to teams that have a rating vector
 * for the given season (preferred for Clubs compare).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seasonIdParam = url.searchParams.get("seasonId");
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const client = getClient();

    let teamIds: number[] | null = null;
    if (seasonIdParam) {
      const seasonId = Number(seasonIdParam);
      const { data: vectors, error } = await client
        .from("glpm_team_rating_vectors")
        .select("team_sm_id")
        .eq("season_id", seasonId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      teamIds = [...new Set((vectors ?? []).map((v) => v.team_sm_id))];
      if (teamIds.length === 0) {
        // Fall back to teams that appear in season matches
        const { data: matches } = await client
          .from("glpm_matches")
          .select("home_team_sm_id,away_team_sm_id")
          .eq("season_id", seasonId)
          .limit(500);
        const ids = new Set<number>();
        for (const m of matches ?? []) {
          ids.add(m.home_team_sm_id);
          ids.add(m.away_team_sm_id);
        }
        teamIds = [...ids];
      }
    }

    let query = client.from("glpm_teams").select("sm_id,name,official_name").order("name");
    if (teamIds != null) {
      if (teamIds.length === 0) {
        return NextResponse.json({ teams: [] });
      }
      query = query.in("sm_id", teamIds);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let teams = (data ?? []).map((t) => ({
      id: t.sm_id,
      name: t.name,
      shortName: t.official_name,
    }));
    if (q) {
      teams = teams.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.shortName ?? "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
