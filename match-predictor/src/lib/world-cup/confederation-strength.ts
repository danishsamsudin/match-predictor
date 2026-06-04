import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

export type FifaConfederation =
  | "UEFA"
  | "CONMEBOL"
  | "CAF"
  | "AFC"
  | "CONCACAF"
  | "OFC";

/**
 * Regional difficulty multipliers for opponent-weighted GF/GA in match history.
 * Goals vs weaker confederations are scaled down before attack/defense rates are derived.
 */
export const CONFEDERATION_STRENGTH_MODIFIER: Record<FifaConfederation, number> = {
  UEFA: 1,
  CONMEBOL: 1,
  CAF: 0.85,
  AFC: 0.85,
  CONCACAF: 0.68,
  OFC: 0.45,
};

const COMPETITION_CONFEDERATION_PATTERNS: { pattern: RegExp; confederation: FifaConfederation }[] = [
  { pattern: /\buefa\b/i, confederation: "UEFA" },
  { pattern: /\bconmebol\b/i, confederation: "CONMEBOL" },
  { pattern: /\bconcacaf\b/i, confederation: "CONCACAF" },
  { pattern: /\bcaf\b/i, confederation: "CAF" },
  { pattern: /\bafc\b/i, confederation: "AFC" },
  { pattern: /\bofc\b/i, confederation: "OFC" },
];

const CONFEDERATION_BY_TEAM_ID = new Map<number, FifaConfederation>([
  [4691, "CAF"],
  [4819, "CONMEBOL"],
  [4741, "AFC"],
  [4718, "UEFA"],
  [4717, "UEFA"],
  [4479, "UEFA"],
  [4748, "CONMEBOL"],
  [4753, "CAF"],
  [4752, "CONCACAF"],
  [4820, "CONMEBOL"],
  [4768, "CAF"],
  [4715, "UEFA"],
  [55827, "CONCACAF"],
  [4714, "UEFA"],
  [4823, "CAF"],
  [4757, "CONMEBOL"],
  [4758, "CAF"],
  [4713, "UEFA"],
  [4481, "UEFA"],
  [4711, "UEFA"],
  [4764, "CAF"],
  [7229, "CONCACAF"],
  [4766, "AFC"],
  [4767, "AFC"],
  [4770, "AFC"],
  [4771, "AFC"],
  [4781, "CONCACAF"],
  [4778, "CAF"],
  [4705, "UEFA"],
  [4784, "OFC"],
  [4475, "UEFA"],
  [5164, "CONCACAF"],
  [4789, "CONMEBOL"],
  [4704, "UEFA"],
  [4792, "AFC"],
  [4834, "AFC"],
  [4695, "UEFA"],
  [4739, "CAF"],
  [4736, "CAF"],
  [4735, "AFC"],
  [4698, "UEFA"],
  [4688, "UEFA"],
  [4699, "UEFA"],
  [4729, "CAF"],
  [4700, "UEFA"],
  [4725, "CONMEBOL"],
  [4724, "CONCACAF"],
  [4723, "AFC"],
]);

const CONFEDERATION_BY_NORMALIZED_NAME = new Map<string, FifaConfederation>();
for (const team of WORLD_CUP_2026_TEAMS) {
  const conf = CONFEDERATION_BY_TEAM_ID.get(team.id);
  if (conf) {
    CONFEDERATION_BY_NORMALIZED_NAME.set(normalizeNationalTeamName(team.name).toLowerCase(), conf);
  }
}

export function resolveNationalConfederation(
  teamId?: number | string | null,
  teamName?: string | null
): FifaConfederation | null {
  const numeric = Number(teamId);
  if (Number.isFinite(numeric) && CONFEDERATION_BY_TEAM_ID.has(numeric)) {
    return CONFEDERATION_BY_TEAM_ID.get(numeric)!;
  }
  if (teamName) {
    const key = normalizeNationalTeamName(teamName).toLowerCase();
    return CONFEDERATION_BY_NORMALIZED_NAME.get(key) ?? null;
  }
  return null;
}

export function confederationStrengthModifier(
  confederation: FifaConfederation | null
): number {
  if (!confederation) return 1;
  return CONFEDERATION_STRENGTH_MODIFIER[confederation];
}

/** Infer confederation from WCQ / regional competition labels when opponent id is unknown. */
export function resolveConfederationFromCompetition(
  competition: string | null | undefined
): FifaConfederation | null {
  const c = competition ?? "";
  for (const { pattern, confederation } of COMPETITION_CONFEDERATION_PATTERNS) {
    if (pattern.test(c)) return confederation;
  }
  return null;
}

/** C_opp — opponent regional difficulty for weighting historical goals. */
export function opponentConfederationModifier(input: {
  opponentTeamId?: string | null;
  opponentTeamName?: string | null;
  competition?: string | null;
}): number {
  const fromTeam = resolveNationalConfederation(
    input.opponentTeamId,
    input.opponentTeamName
  );
  if (fromTeam) return confederationStrengthModifier(fromTeam);
  return confederationStrengthModifier(
    resolveConfederationFromCompetition(input.competition)
  );
}
