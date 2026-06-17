import { NextRequest, NextResponse } from "next/server";
import { dedupeSquadPlayersById, pickUniqueStarters } from "@/lib/data/dedupe-squad-players";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { mergeOfficialWcPlayersIntoRoster } from "@/lib/data/merge-official-wc-roster";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SquadPlayer } from "@/lib/types/team-comparison";

export async function GET(request: NextRequest) {
  const teamId = Number(request.nextUrl.searchParams.get("teamId"));
  const teamName = request.nextUrl.searchParams.get("teamName")?.trim() ?? "";
  const leagueIdParam = request.nextUrl.searchParams.get("leagueId");
  const leagueId =
    leagueIdParam !== null && leagueIdParam !== ""
      ? Number(leagueIdParam)
      : undefined;
  const entityTypeParam = request.nextUrl.searchParams.get("entityType");
  const entityType: EntityType | undefined =
    entityTypeParam === "national"
      ? "national"
      : entityTypeParam === "club"
        ? "club"
        : undefined;

  if (!Number.isFinite(teamId)) {
    return NextResponse.json(
      { error: "Missing or invalid teamId parameter" },
      { status: 400 }
    );
  }

  try {
    const supabase = tryCreateServiceClient();
    const squad = await loadTeamSquadForComparison(
      supabase,
      teamId,
      teamName || undefined,
      Number.isFinite(leagueId) ? leagueId : undefined,
      entityType
    );

    let roster = dedupeSquadPlayersById([...squad.starters, ...squad.substitutes]);
    const wcTeamLabel = resolveWc2026TeamLabel(teamName || undefined, teamId);
    if (wcTeamLabel) {
      roster = dedupeSquadPlayersById(mergeOfficialWcPlayersIntoRoster(roster, wcTeamLabel));
    }

    const uniqueStarters = pickUniqueStarters(squad.starters, roster, 11);
    const suggestedStarters = uniqueStarters.map((starter) => {
      const merged = roster.find((p) => p.sofascorePlayerId === starter.sofascorePlayerId);
      return merged ?? starter;
    });

    return NextResponse.json({
      teamId,
      teamName: teamName || undefined,
      preferredFormation: squad.preferredFormation,
      coach: squad.coach ?? null,
      suggestedStarters,
      roster,
      squadSource: squad.squadSource,
    });
  } catch (error) {
    console.error("Failed to load team squad:", error);
    return NextResponse.json({ error: "Failed to load team squad" }, { status: 500 });
  }
}
