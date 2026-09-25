import type { FixtureLineup } from "@/lib/types/football";
import type {
  SquadPlayer,
  TeamComparisonSnapshot,
  TeamSquadSnapshot,
} from "@/lib/types/team-comparison";

/** Selected XI players are treated as locked starters for prop minutes / ranking. */
const SELECTED_XI_START_SHARE_PCT = 100;

function resolveStartersFromLineup(
  lineup: FixtureLineup,
  existingRoster: SquadPlayer[]
): { starters: SquadPlayer[]; substitutes: SquadPlayer[] } {
  const byId = new Map(existingRoster.map((p) => [p.sofascorePlayerId, p]));
  const starterIds = new Set(lineup.startXI.map((s) => s.player.id));

  const starters: SquadPlayer[] = lineup.startXI.map((slot) => {
    const existing = byId.get(slot.player.id);
    if (existing) {
      return {
        ...existing,
        startSharePct: Math.max(
          existing.startSharePct ?? 0,
          SELECTED_XI_START_SHARE_PCT
        ),
      };
    }
    return {
      sofascorePlayerId: slot.player.id,
      scoutlystPlayerKey: null,
      name: slot.player.name,
      position:
        slot.player.pos === "G"
          ? "GK"
          : slot.player.pos === "D"
            ? "DEF"
            : slot.player.pos === "F"
              ? "FWD"
              : "MID",
      fieldPosition: null,
      performanceScore: slot.player.performanceScore ?? null,
      startSharePct: SELECTED_XI_START_SHARE_PCT,
      detailStats: [],
      age: null,
    };
  });

  const substitutes = existingRoster.filter(
    (p) => !starterIds.has(p.sofascorePlayerId)
  );

  return { starters, substitutes };
}

/** Apply a single team's custom XI onto a squad snapshot. */
export function applyCustomLineupToSquad(
  squad: TeamSquadSnapshot,
  lineup: FixtureLineup | undefined
): TeamSquadSnapshot {
  if (!lineup?.startXI.length) return squad;
  const roster = [...squad.starters, ...squad.substitutes];
  const { starters, substitutes } = resolveStartersFromLineup(lineup, roster);
  return {
    ...squad,
    starters,
    substitutes,
    squadSource: "manual",
    hasLineupData: true,
    preferredFormation: lineup.formation || squad.preferredFormation,
  };
}

export function applyCustomLineupsToTeamComparison(
  snapshot: TeamComparisonSnapshot,
  customLineups: FixtureLineup[]
): TeamComparisonSnapshot {
  const homeLineup = customLineups.find((l) => l.team.id === snapshot.home.teamId);
  const awayLineup = customLineups.find((l) => l.team.id === snapshot.away.teamId);

  const next = { ...snapshot };

  if (homeLineup?.startXI.length) {
    next.home = {
      ...snapshot.home,
      squad: applyCustomLineupToSquad(snapshot.home.squad, homeLineup),
    };
  }

  if (awayLineup?.startXI.length) {
    next.away = {
      ...snapshot.away,
      squad: applyCustomLineupToSquad(snapshot.away.squad, awayLineup),
    };
  }

  return next;
}
