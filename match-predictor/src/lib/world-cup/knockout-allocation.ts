import matrixPayload from "../../../data/world-cup-2026/third-place-allocation-matrix.json";

export type ThirdPlaceAllocationMapping = Record<string, string>;

type MatrixFile = {
  version: string;
  matrix: Record<string, ThirdPlaceAllocationMapping>;
};

const file = matrixPayload as MatrixFile;

export const FIFA_3RD_PLACE_ALLOCATION_MATRIX: Record<string, ThirdPlaceAllocationMapping> =
  file.matrix ?? {};

export const ALLOCATION_MATRIX_VERSION = file.version ?? "unknown";

/**
 * @param advancingGroups - exactly 8 group codes whose third-placed teams advance
 * @returns Bracket slot assignments (e.g. WINNER_A → opponent group letter for 3rd place)
 */
export function assignKnockoutOpponents(advancingGroups: string[]): ThirdPlaceAllocationMapping {
  if (advancingGroups.length !== 8) return {};
  const lookupKey = [...advancingGroups].map((g) => g.toUpperCase()).sort().join("");
  return FIFA_3RD_PLACE_ALLOCATION_MATRIX[lookupKey] ?? {};
}

export function allocationLookupKey(advancingGroups: string[]): string | null {
  if (advancingGroups.length !== 8) return null;
  return [...advancingGroups].map((g) => g.toUpperCase()).sort().join("");
}

export function hasAllocationMatrix(): boolean {
  return Object.keys(FIFA_3RD_PLACE_ALLOCATION_MATRIX).length >= 400;
}
