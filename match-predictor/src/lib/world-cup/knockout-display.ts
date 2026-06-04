import type { GroupStandingRow } from "@/lib/world-cup/standings";

/** Group winners in Round of 32 play a third-placed team per FIFA Annex C. */
export const R32_GROUP_WINNER_SLOTS = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"] as const;

export type RoundOf32Matchup = {
  slot: string;
  homeLabel: string;
  awayLabel: string;
  homeTeam: string;
  awayTeam: string;
};

function resolveStandingSlot(
  slot: string,
  groupMatrix: Record<string, GroupStandingRow[]>
): { label: string; team: string } {
  const m = slot.match(/^([123])([A-L])$/i);
  if (!m) {
    return { label: slot, team: slot };
  }
  const rank = Number(m[1]);
  const group = m[2].toUpperCase();
  const ordinal = rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd";
  const label = `${ordinal} Group ${group}`;
  const row = groupMatrix[group]?.find((r) => r.rank === rank);
  return { label, team: row?.teamName ?? label };
}

/**
 * Turn FIFA bracket slot codes into readable matchups with current projected team names.
 */
export function buildRoundOf32Matchups(
  slotAssignments: Record<string, string>,
  groupMatrix: Record<string, GroupStandingRow[]>
): RoundOf32Matchup[] {
  return R32_GROUP_WINNER_SLOTS.map((slot) => {
    const thirdSlot = slotAssignments[`VS_${slot}`] ?? slotAssignments[slot] ?? "";
    const home = resolveStandingSlot(slot, groupMatrix);
    const away = resolveStandingSlot(thirdSlot, groupMatrix);
    return {
      slot,
      homeLabel: home.label,
      awayLabel: away.label,
      homeTeam: home.team,
      awayTeam: away.team,
    };
  });
}
