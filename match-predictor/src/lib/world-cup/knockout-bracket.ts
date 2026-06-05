import bracketPayload from "../../../data/world-cup-2026/knockout-bracket.json";
import { assignKnockoutOpponents } from "@/lib/world-cup/knockout-allocation";
import type { GroupStandingRow } from "@/lib/world-cup/standings";

export type BracketSlotRef =
  | { type: "standing"; rank: 1 | 2 | 3; group: string }
  | { type: "third_for"; winnerSlot: string }
  | { type: "winner"; match: number }
  | { type: "loser"; match: number };

export type KnockoutBracketMatchDef = {
  match_number: number;
  round: "R32" | "R16" | "QF" | "SF" | "3P" | "F";
  date: string;
  kickoff_time: string | null;
  stadium: string;
  city: string;
  home: BracketSlotRef;
  away: BracketSlotRef;
};

export type TeamRef = {
  teamId: string;
  teamName: string;
};

export type ResolvedKnockoutParticipant = {
  teamId: string;
  teamName: string;
  slotLabel: string;
};

export type ResolvedKnockoutMatch = KnockoutBracketMatchDef & {
  homeTeam: ResolvedKnockoutParticipant;
  awayTeam: ResolvedKnockoutParticipant;
};

type BracketFile = {
  version: string;
  matches: KnockoutBracketMatchDef[];
};

const file = bracketPayload as BracketFile;

export function loadKnockoutBracket(): KnockoutBracketMatchDef[] {
  return file.matches ?? [];
}

export function getKnockoutMatchesByRound(
  round: KnockoutBracketMatchDef["round"]
): KnockoutBracketMatchDef[] {
  return loadKnockoutBracket().filter((m) => m.round === round);
}

function standingSlotLabel(rank: number, group: string): string {
  const ordinal = rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd";
  return `${ordinal} Group ${group.toUpperCase()}`;
}

function resolveStandingSlot(
  rank: number,
  group: string,
  groupMatrix: Record<string, GroupStandingRow[]>
): ResolvedKnockoutParticipant | null {
  const g = group.toUpperCase();
  const row = groupMatrix[g]?.find((r) => r.rank === rank);
  if (!row) return null;
  return {
    teamId: row.teamId,
    teamName: row.teamName,
    slotLabel: standingSlotLabel(rank, g),
  };
}

function resolveThirdForSlot(
  winnerSlot: string,
  slotAssignments: Record<string, string>,
  groupMatrix: Record<string, GroupStandingRow[]>
): ResolvedKnockoutParticipant | null {
  const thirdSlot = slotAssignments[`VS_${winnerSlot}`] ?? "";
  const m = thirdSlot.match(/^3([A-L])$/i);
  if (!m) return null;
  return resolveStandingSlot(3, m[1], groupMatrix);
}

function resolveSlotRef(
  ref: BracketSlotRef,
  groupMatrix: Record<string, GroupStandingRow[]>,
  slotAssignments: Record<string, string>,
  winners: Map<number, TeamRef>,
  losers: Map<number, TeamRef>
): ResolvedKnockoutParticipant | null {
  if (ref.type === "standing") {
    return resolveStandingSlot(ref.rank, ref.group, groupMatrix);
  }
  if (ref.type === "third_for") {
    return resolveThirdForSlot(ref.winnerSlot, slotAssignments, groupMatrix);
  }
  if (ref.type === "winner") {
    const w = winners.get(ref.match);
    if (!w) return null;
    return { teamId: w.teamId, teamName: w.teamName, slotLabel: `W${ref.match}` };
  }
  const l = losers.get(ref.match);
  if (!l) return null;
  return { teamId: l.teamId, teamName: l.teamName, slotLabel: `L${ref.match}` };
}

/** Resolve all R32 participants from simulated group standings + Annex C key. */
export function resolveR32Participants(
  advancingThirdGroups: string[],
  groupMatrix: Record<string, GroupStandingRow[]>
): ResolvedKnockoutMatch[] {
  const slotAssignments = assignKnockoutOpponents(advancingThirdGroups);
  const r32 = getKnockoutMatchesByRound("R32");
  const emptyWinners = new Map<number, TeamRef>();
  const emptyLosers = new Map<number, TeamRef>();

  return r32
    .map((def) => {
      const homeTeam = resolveSlotRef(
        def.home,
        groupMatrix,
        slotAssignments,
        emptyWinners,
        emptyLosers
      );
      const awayTeam = resolveSlotRef(
        def.away,
        groupMatrix,
        slotAssignments,
        emptyWinners,
        emptyLosers
      );
      if (!homeTeam || !awayTeam) return null;
      return { ...def, homeTeam, awayTeam };
    })
    .filter((m): m is ResolvedKnockoutMatch => m !== null);
}

/** Resolve a single knockout match from prior round results. */
export function resolveKnockoutMatch(
  def: KnockoutBracketMatchDef,
  groupMatrix: Record<string, GroupStandingRow[]>,
  slotAssignments: Record<string, string>,
  winners: Map<number, TeamRef>,
  losers: Map<number, TeamRef>
): ResolvedKnockoutMatch | null {
  const homeTeam = resolveSlotRef(
    def.home,
    groupMatrix,
    slotAssignments,
    winners,
    losers
  );
  const awayTeam = resolveSlotRef(
    def.away,
    groupMatrix,
    slotAssignments,
    winners,
    losers
  );
  if (!homeTeam || !awayTeam) return null;
  return { ...def, homeTeam, awayTeam };
}

export function getKnockoutRoundOrder(): KnockoutBracketMatchDef["round"][] {
  return ["R32", "R16", "QF", "SF", "3P", "F"];
}
