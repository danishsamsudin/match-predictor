import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { loadGlpmHubCatalogCached } from "@/lib/glpm/hub-catalog";
import { pickDefaultGlpmSeasonId } from "@/lib/glpm/season-ready";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

/** List GLPM competitions and seasons for Clubs pickers / league hub. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competitionId");
    const catalog = await loadGlpmHubCatalogCached();
    const competitionIdNum = competitionId ? Number(competitionId) : null;

    // end_date is only needed for the seasons picker; fetch lightly when filtered.
    const client = getClient();
    let seasonsQuery = client
      .from("glpm_seasons")
      .select("sm_id,start_date,end_date")
      .order("start_date", { ascending: false });
    if (competitionIdNum != null) {
      seasonsQuery = seasonsQuery.eq("competition_id", competitionIdNum);
    }
    const { data: seasonDates, error: sErr } = await seasonsQuery;
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }
    const datesById = new Map(
      (seasonDates ?? []).map((s) => [
        s.sm_id,
        { startDate: s.start_date, endDate: s.end_date },
      ] as const)
    );

    const seasonsPool =
      competitionIdNum != null
        ? catalog.seasonsForPayload.filter((s) => s.competitionId === competitionIdNum)
        : catalog.seasonsForPayload;

    const defaultSeasonId = pickDefaultGlpmSeasonId(
      catalog.seasonList,
      catalog.readiness,
      competitionIdNum
    );

    return NextResponse.json({
      competitions: catalog.competitionList.map((c) => ({
        id: c.smId,
        name: c.name,
        areaName: c.areaName,
        defaultSeasonId: c.defaultSeasonId,
      })),
      seasons: seasonsPool.map((s) => ({
        id: s.smId,
        name: s.name,
        competitionId: s.competitionId,
        startDate: datesById.get(s.smId)?.startDate ?? null,
        endDate: datesById.get(s.smId)?.endDate ?? null,
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
