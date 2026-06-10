import { NextRequest, NextResponse } from "next/server";
import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { positionDisplayLabel } from "@/lib/data/normalize-player-position";
import {
  getOfficialWcTeamSquad,
  resolveWc2026TeamLabel,
} from "@/lib/data/world-cup-2026-official-squads";
import { normalizeText } from "@/lib/soccerdata/normalize";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function dedupeRoster(players: SquadPlayer[]): SquadPlayer[] {
  const seen = new Set<number>();
  const out: SquadPlayer[] = [];
  for (const player of players) {
    if (seen.has(player.sofascorePlayerId)) continue;
    seen.add(player.sofascorePlayerId);
    out.push(player);
  }
  return out;
}

/** Ensure every published FIFA World Cup squad player appears in the picker roster. */
function mergeOfficialWcPlayersIntoRoster(
  roster: SquadPlayer[],
  teamLabel: string
): SquadPlayer[] {
  const official = getOfficialWcTeamSquad(teamLabel);
  if (!official?.players.length) return roster;

  const byNormName = new Map(
    roster.map((p) => [normalizeText(formatPlayerDisplayNameIfNeeded(p.name)), p])
  );
  const seenIds = new Set(roster.map((p) => p.sofascorePlayerId));
  const merged = [...roster];

  for (const officialPlayer of official.players) {
    const displayName = formatPlayerDisplayNameIfNeeded(officialPlayer.name);
    const norm = normalizeText(displayName);
    if (byNormName.has(norm)) continue;

    const sofascorePlayerId = stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`);
    if (seenIds.has(sofascorePlayerId)) continue;

    merged.push({
      sofascorePlayerId,
      scoutlystPlayerKey: `wc2026:${teamLabel}:${norm}`,
      name: displayName,
      position: positionDisplayLabel(officialPlayer.position),
      fieldPosition: officialPlayer.position,
      performanceScore: null,
      startSharePct: null,
      detailStats: [],
      age: null,
    });
    seenIds.add(sofascorePlayerId);
    byNormName.set(norm, merged[merged.length - 1]);
  }

  return merged;
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

    let roster = dedupeRoster([...squad.starters, ...squad.substitutes]);
    const wcTeamLabel = resolveWc2026TeamLabel(teamName || undefined, teamId);
    if (wcTeamLabel) {
      roster = mergeOfficialWcPlayersIntoRoster(roster, wcTeamLabel);
    }

    return NextResponse.json({
      teamId,
      teamName: teamName || undefined,
      preferredFormation: squad.preferredFormation,
      coach: squad.coach ?? null,
      suggestedStarters: squad.starters,
      roster,
      squadSource: squad.squadSource,
    });
  } catch (error) {
    console.error("Failed to load team squad:", error);
    return NextResponse.json({ error: "Failed to load team squad" }, { status: 500 });
  }
}
