import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";

export type FormationTargets = { G: number; D: number; M: number; F: number };

const DEFAULT_FORMATION = "4-3-3";

/** Appearance vs quality blend for within-slot lineup ranking. */
export const LINEUP_APPEARANCE_WEIGHT = 0.6;
export const LINEUP_QUALITY_WEIGHT = 0.4;

/** Most frequent formation string from recent matches. */
export function pickPreferredFormation(formations: string[]): string | null {
  const counts = new Map<string, number>();
  for (const formation of formations) {
    const trimmed = formation.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Map outfield formation string (e.g. 4-2-3-1) to GK + D/M/F slot counts. */
export function parseFormationToTargets(formation: string | null | undefined): FormationTargets {
  const parts = (formation ?? DEFAULT_FORMATION)
    .split(/[-/]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (parts.length === 3) {
    return { G: 1, D: parts[0], M: parts[1], F: parts[2] };
  }
  if (parts.length === 4) {
    return { G: 1, D: parts[0], M: parts[1] + parts[2], F: parts[3] };
  }
  if (parts.length === 5) {
    return { G: 1, D: parts[0], M: parts[1] + parts[2] + parts[3], F: parts[4] };
  }

  return { G: 1, D: 4, M: 3, F: 3 };
}

type PickablePlayer = {
  id: number;
  starts: number;
  subAppearances: number;
  dominantPosition: () => "G" | "D" | "M" | "F";
};

export function computeLineupRankScore(
  starts: number,
  maxStarts: number,
  qualityScore: number
): number {
  const appearanceNorm = maxStarts > 0 ? starts / maxStarts : 0;
  const qualityNorm = Math.max(0, Math.min(100, qualityScore)) / 100;
  return (
    LINEUP_APPEARANCE_WEIGHT * appearanceNorm + LINEUP_QUALITY_WEIGHT * qualityNorm
  );
}

function compareLineupPlayers<T extends PickablePlayer>(
  a: T,
  b: T,
  rankById: Map<number, number>
): number {
  const rankA = rankById.get(a.id) ?? 0;
  const rankB = rankById.get(b.id) ?? 0;
  if (rankB !== rankA) return rankB - rankA;
  if (b.starts !== a.starts) return b.starts - a.starts;
  return b.subAppearances - a.subAppearances;
}

/** Pick XI by formation slots, ranked by hybrid appearance + quality score. */
export function pickStartersByFormation<T extends PickablePlayer>(
  players: T[],
  formation: string | null | undefined,
  options?: {
    qualityById?: Map<number, number>;
    limit?: number;
  }
): T[] {
  const limit = options?.limit ?? 11;
  const targets = parseFormationToTargets(formation);
  const maxStarts = Math.max(0, ...players.map((p) => p.starts));
  const qualityById = options?.qualityById ?? new Map<number, number>();

  const rankById = new Map<number, number>();
  for (const player of players) {
    const quality = qualityById.get(player.id) ?? 0;
    rankById.set(player.id, computeLineupRankScore(player.starts, maxStarts, quality));
  }

  const sorted = [...players].sort((a, b) => compareLineupPlayers(a, b, rankById));
  const picked: T[] = [];
  const used = new Set<number>();
  let gkCount = 0;

  const hasAppearances = (p: T) => p.starts > 0 || p.subAppearances > 0;

  const take = (pos: "G" | "D" | "M" | "F", count: number) => {
    for (const player of sorted) {
      if (picked.length >= limit) break;
      if (!hasAppearances(player)) continue;
      if (used.has(player.id)) continue;
      if (player.dominantPosition() !== pos) continue;
      picked.push(player);
      used.add(player.id);
      if (pos === "G") gkCount += 1;
      if (--count <= 0) break;
    }
  };

  take("G", targets.G);
  take("D", targets.D);
  take("M", targets.M);
  take("F", targets.F);

  for (const player of sorted) {
    if (picked.length >= limit) break;
    if (!hasAppearances(player)) continue;
    if (used.has(player.id)) continue;
    if (player.dominantPosition() === "G" && gkCount >= targets.G) continue;
    picked.push(player);
    used.add(player.id);
    if (player.dominantPosition() === "G") gkCount += 1;
  }

  for (const player of sorted) {
    if (picked.length >= limit) break;
    if (!hasAppearances(player)) continue;
    if (used.has(player.id)) continue;
    picked.push(player);
    used.add(player.id);
  }

  return picked;
}

export function dominantStartPosition(
  counts: Partial<Record<"G" | "D" | "M" | "F", number>>,
  fallback: string | null
): "G" | "D" | "M" | "F" {
  const roles: Array<"G" | "D" | "M" | "F"> = ["G", "D", "M", "F"];
  let best: "G" | "D" | "M" | "F" = normalizePlayerPosition(fallback);
  let bestCount = -1;
  for (const role of roles) {
    const n = counts[role] ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = role;
    }
  }
  return best;
}
