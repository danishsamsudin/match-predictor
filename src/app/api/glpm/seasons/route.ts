import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import {
  annotateSeasonReadiness,
  loadGlpmSeasonReadiness,
  pickDefaultGlpmSeasonId,
} from "@/lib/glpm/season-ready";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

/** List GLPM competitions and seasons for Clubs pickers / league hub. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competitionId");
    const client = getClient();

    const { data: competitions, error: cErr } = await client
      .from("glpm_competitions")
      .select("sm_id,name,area_name")
      .order("name");
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    let seasonsQuery = client
      .from("glpm_seasons")
      .select("sm_id,name,competition_id,start_date,end_date")
      .order("start_date", { ascending: false });
    if (competitionId) {
      seasonsQuery = seasonsQuery.eq("competition_id", Number(competitionId));
    }
    const { data: seasons, error: sErr } = await seasonsQuery;
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const readiness = await loadGlpmSeasonReadiness(client);
    const seasonRefs = (seasons ?? []).map((s) => ({
      smId: s.sm_id,
      name: s.name,
      competitionId: s.competition_id,
    }));
    const annotated = annotateSeasonReadiness(seasonRefs, readiness);
    const competitionIdNum = competitionId ? Number(competitionId) : null;
    const defaultSeasonId = pickDefaultGlpmSeasonId(
      seasonRefs,
      readiness,
      competitionIdNum
    );

    return NextResponse.json({
      competitions: (competitions ?? []).map((c) => ({
        id: c.sm_id,
        name: c.name,
        areaName: c.area_name,
        defaultSeasonId: pickDefaultGlpmSeasonId(seasonRefs, readiness, c.sm_id),
      })),
      seasons: annotated.map((s) => ({
        id: s.smId,
        name: s.name,
        competitionId: s.competitionId,
        startDate: seasons?.find((row) => row.sm_id === s.smId)?.start_date ?? null,
        endDate: seasons?.find((row) => row.sm_id === s.smId)?.end_date ?? null,
        hasVectors: s.hasVectors,
        hasFinishedMatches: s.hasFinishedMatches,
        hasUpcomingMatches: s.hasUpcomingMatches,
        isPredictReady: s.isPredictReady,
      })),
      defaultSeasonId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load seasons";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
