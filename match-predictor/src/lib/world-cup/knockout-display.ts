import { resolveR32Participants } from "@/lib/world-cup/knockout-bracket";
import type { GroupStandingRow } from "@/lib/world-cup/standings";

/** Group winners in Round of 32 play a third-placed team per FIFA Annex C. */
export const R32_GROUP_WINNER_SLOTS = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"] as const;

export type RoundOf32Matchup = {
  slot: string;
  matchNumber: number;
  homeLabel: string;
  awayLabel: string;
  homeTeam: string;
  awayTeam: string;
};

/**
 * All 16 Round of 32 matchups with current projected team names.
 */
export function buildRoundOf32Matchups(
  slotAssignments: Record<string, string>,
  groupMatrix: Record<string, GroupStandingRow[]>,
  advancingThirdGroups?: string[]
): RoundOf32Matchup[] {
  const advancing =
    advancingThirdGroups ??
    Object.entries(slotAssignments)
      .filter(([k]) => k.startsWith("VS_"))
      .map(([, v]) => v.replace(/^3/i, "").toUpperCase())
      .filter(Boolean);

  const resolved = resolveR32Participants(advancing, groupMatrix);
  return resolved.map((m) => ({
    slot: `M${m.match_number}`,
    matchNumber: m.match_number,
    homeLabel: m.homeTeam.slotLabel,
    awayLabel: m.awayTeam.slotLabel,
    homeTeam: m.homeTeam.teamName,
    awayTeam: m.awayTeam.teamName,
  }));
}
