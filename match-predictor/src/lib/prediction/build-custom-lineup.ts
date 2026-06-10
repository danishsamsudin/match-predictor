import type { FixtureLineup } from "@/lib/types/football";
import type { SquadPlayer, TeamComparisonSnapshot } from "@/lib/types/team-comparison";

const POS_MAP: Record<string, string> = {
  GK: "G",
  DEF: "D",
  MID: "M",
  FWD: "F",
};

export function squadPositionToLineupPos(position: string): string {
  return POS_MAP[position] ?? "M";
}

export function squadPlayersToFixtureLineup(
  teamId: number,
  teamName: string,
  formation: string | null,
  selectedPlayers: SquadPlayer[],
  roster?: SquadPlayer[]
): FixtureLineup {
  const selectedIds = new Set(selectedPlayers.map((p) => p.sofascorePlayerId));
  const benchPool = roster ?? selectedPlayers;

  return {
    team: { id: teamId, name: teamName },
    formation: formation ?? "4-3-3",
    startXI: selectedPlayers.map((p, i) => ({
      player: {
        id: p.sofascorePlayerId,
        name: p.name,
        number: i + 1,
        pos: squadPositionToLineupPos(p.position),
        grid: null,
        performanceScore: p.performanceScore ?? undefined,
      },
    })),
    substitutes: benchPool
      .filter((p) => !selectedIds.has(p.sofascorePlayerId))
      .map((p, i) => ({
        player: {
          id: p.sofascorePlayerId,
          name: p.name,
          number: 20 + i,
          pos: squadPositionToLineupPos(p.position),
          grid: null,
          performanceScore: p.performanceScore ?? undefined,
        },
      })),
  };
}

export function squadToLineupWithBenched(
  teamId: number,
  teamName: string,
  formation: string | null,
  starters: SquadPlayer[],
  benchedIds: Set<number>
): FixtureLineup {
  const active = starters.filter((p) => !benchedIds.has(p.sofascorePlayerId));
  return squadPlayersToFixtureLineup(teamId, teamName, formation, active, starters);
}

export function buildLineupsFromComparison(
  snapshot: TeamComparisonSnapshot,
  homeBenched: Set<number>,
  awayBenched: Set<number>
): FixtureLineup[] {
  const lineups: FixtureLineup[] = [];
  const home = snapshot.home.squad;
  const away = snapshot.away.squad;
  if (home.hasLineupData && home.starters.length) {
    lineups.push(
      squadToLineupWithBenched(
        snapshot.home.teamId,
        snapshot.home.teamName,
        home.preferredFormation,
        home.starters,
        homeBenched
      )
    );
  }
  if (away.hasLineupData && away.starters.length) {
    lineups.push(
      squadToLineupWithBenched(
        snapshot.away.teamId,
        snapshot.away.teamName,
        away.preferredFormation,
        away.starters,
        awayBenched
      )
    );
  }
  return lineups;
}

export type SquadRosterSide = {
  teamId: number;
  teamName: string;
  preferredFormation: string | null;
  roster: SquadPlayer[];
};

export function buildCustomLineupsFromSelections(
  home: SquadRosterSide,
  away: SquadRosterSide,
  homeXiIds: number[],
  awayXiIds: number[]
): FixtureLineup[] {
  const rosterById = (roster: SquadPlayer[]) =>
    new Map(roster.map((p) => [p.sofascorePlayerId, p]));

  const homeMap = rosterById(home.roster);
  const awayMap = rosterById(away.roster);

  const homePlayers = homeXiIds
    .map((id) => homeMap.get(id))
    .filter((p): p is SquadPlayer => p != null);
  const awayPlayers = awayXiIds
    .map((id) => awayMap.get(id))
    .filter((p): p is SquadPlayer => p != null);

  return [
    squadPlayersToFixtureLineup(
      home.teamId,
      home.teamName,
      home.preferredFormation,
      homePlayers,
      home.roster
    ),
    squadPlayersToFixtureLineup(
      away.teamId,
      away.teamName,
      away.preferredFormation,
      awayPlayers,
      away.roster
    ),
  ];
}

export function isXiComplete(slots: (number | null)[]): boolean {
  if (slots.length !== 11) return false;
  const ids = slots.filter((id): id is number => id != null);
  if (ids.length !== 11) return false;
  return new Set(ids).size === 11;
}

export function xiHasGoalkeeper(
  slots: (number | null)[],
  roster: SquadPlayer[]
): boolean {
  const byId = new Map(roster.map((p) => [p.sofascorePlayerId, p]));
  return slots.some((id) => id != null && byId.get(id)?.position === "GK");
}
