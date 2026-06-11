import { NextRequest, NextResponse } from "next/server";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { mergeOfficialWcPlayersIntoRoster } from "@/lib/data/merge-official-wc-roster";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function dedupeRosterById(players: SquadPlayer[]): SquadPlayer[] {
  const seen = new Set<number>();
  const out: SquadPlayer[] = [];
  for (const player of players) {
    if (seen.has(player.sofascorePlayerId)) continue;
    seen.add(player.sofascorePlayerId);
    out.push(player);
  }
  return out;
}

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

    let roster = dedupeRosterById([...squad.starters, ...squad.substitutes]);
    if (squad.squadSource !== "sofifa") {
      const wcTeamLabel = resolveWc2026TeamLabel(teamName || undefined, teamId);
      if (wcTeamLabel) {
        roster = mergeOfficialWcPlayersIntoRoster(roster, wcTeamLabel);
      }
    }

    const suggestedStarters = squad.starters.map((starter) => {
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
