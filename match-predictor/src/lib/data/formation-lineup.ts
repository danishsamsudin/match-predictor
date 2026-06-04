import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";

export type FormationTargets = { G: number; D: number; M: number; F: number };

export type GranularTargets = {
  G: number;
  CB: number;
  FB: number;
  DM: number;
  AM: number;
  W: number;
  ST: number;
};

export type GranularSubRole = keyof GranularTargets;

const DEFAULT_FORMATION = "4-3-3";

const GRANULAR_FILL_ORDER: GranularSubRole[] = [
  "G",
  "CB",
  "FB",
  "DM",
  "AM",
  "W",
  "ST",
];

/** Appearance vs quality blend for club lineup ranking. */
export const LINEUP_APPEARANCE_WEIGHT = 0.6;
export const LINEUP_QUALITY_WEIGHT = 0.4;

/** Forces player to bottom of pick stack (injury / suspension override). */
export const LINEUP_UNAVAILABLE_QUALITY = -999;

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

/** Tactical sub-role targets for common formations (balanced width and spine). */
export function parseGranularFormation(formation: string | null | undefined): GranularTargets {
  const f = (formation ?? DEFAULT_FORMATION).trim();

  if (f === "4-3-3") {
    return { G: 1, CB: 2, FB: 2, DM: 1, AM: 2, W: 2, ST: 1 };
  }
  if (f === "4-2-3-1") {
    return { G: 1, CB: 2, FB: 2, DM: 2, AM: 1, W: 2, ST: 1 };
  }
  if (f === "3-5-2" || f === "5-3-2") {
    return { G: 1, CB: 3, FB: 2, DM: 2, AM: 1, W: 0, ST: 2 };
  }
  if (f === "4-4-2") {
    return { G: 1, CB: 2, FB: 2, DM: 2, AM: 0, W: 2, ST: 2 };
  }

  const broad = parseFormationToTargets(f);
  const d = broad.D;
  const cb = Math.max(1, Math.floor(d / 2));
  const fb = Math.max(0, d - cb);
  const m = broad.M;
  const dm = Math.max(0, Math.floor(m / 2));
  const am = Math.max(0, m - dm);
  const fLine = broad.F;
  const st = Math.max(1, Math.floor(fLine / 2));
  const w = Math.max(0, fLine - st);
  return { G: 1, CB: cb, FB: fb, DM: dm, AM: am, W: w, ST: st };
}

export function mapFieldPositionToSubRole(pos: string | null): GranularSubRole {
  if (!pos) return "AM";
  const normalized = pos.toUpperCase().trim();

  if (["G", "GK"].includes(normalized)) return "G";
  if (["CB", "RCB", "LCB", "DC"].includes(normalized)) return "CB";
  if (["LB", "RB", "LWB", "RWB", "DL", "DR"].includes(normalized)) return "FB";
  if (["DM", "CDM", "CM", "LCM", "RCM"].includes(normalized)) {
    return normalized.includes("DM") || normalized === "CDM" ? "DM" : "AM";
  }
  if (["AM", "CAM", "AMC"].includes(normalized)) return "AM";
  if (["LW", "RW", "LM", "RM", "AML", "AMR"].includes(normalized)) return "W";
  if (["ST", "CF", "FW", "FC"].includes(normalized)) return "ST";

  const broad = normalizePlayerPosition(pos);
  if (broad === "G") return "G";
  if (broad === "D") return "CB";
  if (broad === "F") return "ST";
  return "AM";
}

export function dominantStartSubRole(
  counts: Partial<Record<GranularSubRole, number>>,
  fallback: string | null
): GranularSubRole {
  let best: GranularSubRole = mapFieldPositionToSubRole(fallback);
  let bestCount = -1;
  for (const role of GRANULAR_FILL_ORDER) {
    const n = counts[role] ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = role;
    }
  }
  return best;
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

export type LineupRankParams = {
  starts: number;
  maxStarts: number;
  qualityScore: number;
  entityType?: "club" | "national";
  clubMinutes?: number;
  clubRating?: number;
};

export function computeLineupRankScore(params: LineupRankParams): number;
export function computeLineupRankScore(
  starts: number,
  maxStarts: number,
  qualityScore: number
): number;
export function computeLineupRankScore(
  startsOrParams: number | LineupRankParams,
  maxStarts?: number,
  qualityScore?: number
): number {
  const params: LineupRankParams =
    typeof startsOrParams === "object"
      ? startsOrParams
      : {
          starts: startsOrParams,
          maxStarts: maxStarts ?? 0,
          qualityScore: qualityScore ?? 0,
          entityType: "club",
        };

  const appearanceNorm =
    params.maxStarts > 0 ? params.starts / params.maxStarts : 0;
  const qualityNorm = Math.max(0, Math.min(100, params.qualityScore)) / 100;

  if (params.entityType !== "national") {
    return LINEUP_APPEARANCE_WEIGHT * appearanceNorm + LINEUP_QUALITY_WEIGHT * qualityNorm;
  }

  const clubMin = params.clubMinutes ?? 0;
  const clubMinutesNorm = Math.min(clubMin, 2700) / 2700;
  const clubRatingNorm = params.clubRating
    ? Math.max(0, Math.min(100, params.clubRating)) / 100
    : qualityNorm;

  const intlPedigree = 0.3 * appearanceNorm + 0.3 * qualityNorm;
  const clubActiveForm = 0.2 * clubMinutesNorm + 0.2 * clubRatingNorm;
  return intlPedigree + clubActiveForm;
}

type PickablePlayer = {
  id: number;
  starts: number;
  subAppearances: number;
  dominantPosition: () => "G" | "D" | "M" | "F";
  dominantSubRole?: () => GranularSubRole;
  fieldPosition?: string | null;
};

function resolvePlayerSubRole(player: PickablePlayer): GranularSubRole {
  if (player.dominantSubRole) return player.dominantSubRole();
  if (player.fieldPosition) return mapFieldPositionToSubRole(player.fieldPosition);
  return mapFieldPositionToSubRole(null);
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

/** Pick XI by granular tactical slots, then broad-line and general fallbacks. */
export function pickStartersByFormation<T extends PickablePlayer>(
  players: T[],
  formation: string | null | undefined,
  options?: {
    qualityById?: Map<number, number>;
    limit?: number;
    /** When true, only count actual starts (not sub appearances) toward XI slots. */
    requireStarts?: boolean;
    entityType?: "club" | "national";
    clubMinutesById?: Map<number, number>;
    clubRatingById?: Map<number, number>;
  }
): T[] {
  const limit = options?.limit ?? 11;
  const granular = parseGranularFormation(formation);
  const broad = parseFormationToTargets(formation);
  const maxStarts = Math.max(0, ...players.map((p) => p.starts));
  const qualityById = options?.qualityById ?? new Map<number, number>();

  const rankById = new Map<number, number>();
  for (const player of players) {
    const quality = qualityById.get(player.id) ?? 0;
    rankById.set(
      player.id,
      computeLineupRankScore({
        starts: player.starts,
        maxStarts,
        qualityScore: quality,
        entityType: options?.entityType ?? "club",
        clubMinutes: options?.clubMinutesById?.get(player.id),
        clubRating: options?.clubRatingById?.get(player.id),
      })
    );
  }

  const sorted = [...players].sort((a, b) => compareLineupPlayers(a, b, rankById));
  const picked: T[] = [];
  const used = new Set<number>();
  let gkCount = 0;

  const hasAppearances = (p: T) =>
    options?.requireStarts ? p.starts > 0 : p.starts > 0 || p.subAppearances > 0;

  const takeSubRole = (role: GranularSubRole, count: number) => {
    for (const player of sorted) {
      if (picked.length >= limit) break;
      if (!hasAppearances(player)) continue;
      if (used.has(player.id)) continue;
      if (count <= 0) break;
      if (resolvePlayerSubRole(player) !== role) continue;
      picked.push(player);
      used.add(player.id);
      if (role === "G") gkCount += 1;
      count -= 1;
    }
  };

  for (const role of GRANULAR_FILL_ORDER) {
    takeSubRole(role, granular[role]);
  }

  const takeBroad = (pos: "G" | "D" | "M" | "F", count: number) => {
    for (const player of sorted) {
      if (picked.length >= limit || count <= 0) break;
      if (!hasAppearances(player)) continue;
      if (used.has(player.id)) continue;
      if (player.dominantPosition() !== pos) continue;
      picked.push(player);
      used.add(player.id);
      if (pos === "G") gkCount += 1;
      count -= 1;
    }
  };

  const gkRemaining = Math.max(0, broad.G - gkCount);
  takeBroad("G", gkRemaining);

  const broadRemaining = {
    D: Math.max(0, broad.D - picked.filter((p) => p.dominantPosition() === "D").length),
    M: Math.max(0, broad.M - picked.filter((p) => p.dominantPosition() === "M").length),
    F: Math.max(0, broad.F - picked.filter((p) => p.dominantPosition() === "F").length),
  };
  takeBroad("D", broadRemaining.D);
  takeBroad("M", broadRemaining.M);
  takeBroad("F", broadRemaining.F);

  for (const player of sorted) {
    if (picked.length >= limit) break;
    if (!hasAppearances(player)) continue;
    if (used.has(player.id)) continue;
    if (player.dominantPosition() === "G" && gkCount >= broad.G) continue;
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
