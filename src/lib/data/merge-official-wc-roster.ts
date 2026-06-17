import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { positionDisplayLabel } from "@/lib/data/normalize-player-position";
import { getOfficialWcTeamSquad } from "@/lib/data/world-cup-2026-official-squads";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SquadPlayer } from "@/lib/types/team-comparison";

/** Ensure every published FIFA World Cup squad player appears in the picker roster. */
export function mergeOfficialWcPlayersIntoRoster(
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
