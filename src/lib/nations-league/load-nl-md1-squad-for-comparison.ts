import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { positionDisplayLabel } from "@/lib/data/normalize-player-position";
import {
  getNlMd1TeamLineup,
  nlMd1SquadScrapedAt,
  type NlMd1Player,
} from "@/lib/nations-league/md1-starting-xis-data";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";

function toSquadPlayer(p: NlMd1Player): SquadPlayer {
  return {
    sofascorePlayerId: p.sofascorePlayerId,
    scoutlystPlayerKey: null,
    name: formatPlayerDisplayNameIfNeeded(p.name),
    position: positionDisplayLabel(p.position),
    fieldPosition: p.position,
    performanceScore: null,
    startSharePct: p.substitute ? null : 100,
    detailStats: [],
    age: null,
  };
}

/**
 * Build a comparison squad snapshot from Nations League MD1 actual lineups.
 * Starters = MD1 XI; everyone else on the matchday sheet is a substitute.
 */
export function loadNlMd1SquadForComparison(
  teamId: number,
  teamName?: string
): TeamSquadSnapshot | null {
  const lineup = getNlMd1TeamLineup(teamId, teamName);
  if (!lineup || lineup.starters.length < 11) return null;

  const starters = lineup.starters.slice(0, 11).map(toSquadPlayer);
  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const substitutes = lineup.substitutes
    .filter((p) => !starterIds.has(p.sofascorePlayerId))
    .map(toSquadPlayer);

  return {
    starters,
    substitutes,
    hasLineupData: true,
    hasScoutlystData: false,
    squadSource: "nl_md1",
    preferredFormation: lineup.formation,
    snapshotDate: nlMd1SquadScrapedAt()?.slice(0, 10) ?? null,
    coach: null,
  };
}
