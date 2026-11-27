import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { loadGlpmTeamsForSeasonCached } from "@/lib/glpm/load-teams-for-season";

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

    if (seasonIdParam) {
      const seasonId = Number(seasonIdParam);
      if (!Number.isFinite(seasonId)) {
        return NextResponse.json({ error: "Invalid seasonId" }, { status: 400 });
      }
      let teams = await loadGlpmTeamsForSeasonCached(seasonId);
      if (q) {
        teams = teams.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.shortName ?? "").toLowerCase().includes(q)
        );
      }
      return NextResponse.json(
        { teams },
        {
          headers: {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
          },
        }
      );
    }

    const client = getClient();
    const query = client.from("glpm_teams").select("sm_id,name,official_name").order("name");
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let teams = (data ?? []).map((t) => ({
      id: t.sm_id,
      name: t.name,
      shortName: t.official_name,
      promotedWarning: false,
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
