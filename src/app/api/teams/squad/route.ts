import { NextRequest, NextResponse } from "next/server";
import {
  alignStartersToRoster,
  dedupeSquadPlayersById,
  pickUniqueStarters,
} from "@/lib/data/dedupe-squad-players";
import { dedupeSquadRosterByPlayerIdentity } from "@/lib/data/dedupe-squad-roster";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { mergeOfficialWcPlayersIntoRoster } from "@/lib/data/merge-official-wc-roster";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { resolveBulinewsPredictedXi } from "@/lib/nations-league/resolve-bulinews-predicted-xi";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function finalizeRoster(
  players: SquadPlayer[],
  entityType: EntityType | undefined
): SquadPlayer[] {
  const byId = dedupeSquadPlayersById(players);
  // Club squads can share surnames across different players; only national
  // rosters safely collapse SofaScore short names vs FIFA/official full names.
  if (entityType === "national") {
    return dedupeSquadRosterByPlayerIdentity(byId);
  }
  return byId;
}

export async function GET(request: NextRequest) {
  const teamId = Number(request.nextUrl.searchParams.get("teamId"));
  const teamName = request.nextUrl.searchParams.get("teamName")?.trim() ?? "";
  const opponentName =
    request.nextUrl.searchParams.get("opponentName")?.trim() ?? "";
  const sideParam = request.nextUrl.searchParams.get("side");
  const sideHint =
    sideParam === "home" || sideParam === "away" ? sideParam : undefined;
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

    let roster = finalizeRoster([...squad.starters, ...squad.substitutes], entityType);
    const wcTeamLabel = resolveWc2026TeamLabel(teamName || undefined, teamId);
    if (wcTeamLabel) {
      roster = finalizeRoster(
        mergeOfficialWcPlayersIntoRoster(roster, wcTeamLabel),
        entityType ?? "national"
      );
    }

    let preferredFormation = squad.preferredFormation;
    let squadSource = squad.squadSource;
    let uniqueStarters: SquadPlayer[] = pickUniqueStarters(squad.starters, roster, 11);

    if (entityType === "national" && teamName && opponentName) {
      const bulinews = resolveBulinewsPredictedXi({
        teamName,
        opponentName,
        sideHint,
        roster,
      });
      if (bulinews) {
        roster = finalizeRoster(bulinews.roster, "national");
        uniqueStarters = alignStartersToRoster(bulinews.starters, roster, 11);
        preferredFormation = bulinews.formation ?? preferredFormation;
        squadSource = "bulinews";
      }
    }

    const suggestedStarters = alignStartersToRoster(uniqueStarters, roster, 11);

    return NextResponse.json({
      teamId,
      teamName: teamName || undefined,
      preferredFormation,
      coach: squad.coach ?? null,
      suggestedStarters,
      roster,
      squadSource,
    });
  } catch (error) {
    console.error("Failed to load team squad:", error);
    return NextResponse.json({ error: "Failed to load team squad" }, { status: 500 });
  }
}
