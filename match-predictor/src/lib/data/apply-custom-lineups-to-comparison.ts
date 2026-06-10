import type { FixtureLineup } from "@/lib/types/football";
import type { SquadPlayer, TeamComparisonSnapshot } from "@/lib/types/team-comparison";

function resolveStartersFromLineup(
  lineup: FixtureLineup,
  existingRoster: SquadPlayer[]
): { starters: SquadPlayer[]; substitutes: SquadPlayer[] } {
  const byId = new Map(existingRoster.map((p) => [p.sofascorePlayerId, p]));
  const starterIds = new Set(lineup.startXI.map((s) => s.player.id));

  const starters: SquadPlayer[] = lineup.startXI.map((slot) => {
    const existing = byId.get(slot.player.id);
    if (existing) return existing;
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
      startSharePct: null,
      detailStats: [],
      age: null,
    };
  });

  const substitutes = existingRoster.filter(
    (p) => !starterIds.has(p.sofascorePlayerId)
  );

  return { starters, substitutes };
}

export function applyCustomLineupsToTeamComparison(
  snapshot: TeamComparisonSnapshot,
  customLineups: FixtureLineup[]
): TeamComparisonSnapshot {
  const homeLineup = customLineups.find((l) => l.team.id === snapshot.home.teamId);
  const awayLineup = customLineups.find((l) => l.team.id === snapshot.away.teamId);

  const homeRoster = [
    ...snapshot.home.squad.starters,
    ...snapshot.home.squad.substitutes,
  ];
  const awayRoster = [
    ...snapshot.away.squad.starters,
    ...snapshot.away.squad.substitutes,
  ];

  const next = { ...snapshot };

  if (homeLineup?.startXI.length) {
    const { starters, substitutes } = resolveStartersFromLineup(homeLineup, homeRoster);
    next.home = {
      ...snapshot.home,
      squad: {
        ...snapshot.home.squad,
        starters,
        substitutes,
        squadSource: "manual",
        hasLineupData: true,
        preferredFormation:
          homeLineup.formation || snapshot.home.squad.preferredFormation,
      },
    };
  }

  if (awayLineup?.startXI.length) {
    const { starters, substitutes } = resolveStartersFromLineup(awayLineup, awayRoster);
    next.away = {
      ...snapshot.away,
      squad: {
        ...snapshot.away.squad,
        starters,
        substitutes,
        squadSource: "manual",
        hasLineupData: true,
        preferredFormation:
          awayLineup.formation || snapshot.away.squad.preferredFormation,
      },
    };
  }

  return next;
}
