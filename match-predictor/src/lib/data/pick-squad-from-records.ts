import {
  computeLineupRankScore,
  mapFieldPositionToSubRole,
  pickStartersByFormation,
} from "@/lib/data/formation-lineup";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";
import type { EntityType } from "@/lib/types/football-lookup";
import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";

export type SquadPickRecord = {
  id: string;
  name: string;
  position: string | null;
  starts: number;
  subAppearances: number;
  minutes: number;
  stats: Record<string, string | number | null>;
  rating?: number | null;
};

function parseIntStat(stats: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = stats[key];
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

function stableNumericId(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/** Build pick rows from FBref / Scoutlyst stat bundles. */
export function squadPickRecordFromStats(input: {
  id: string;
  name: string;
  position: string | null;
  stats: Record<string, string | number | null>;
  rating?: number | null;
}): SquadPickRecord {
  const statsObj = input.stats as Record<string, unknown>;
  const starts = parseIntStat(statsObj, ["games_starts", "starts", "gamesStarts", "gs"]);
  const subAppearances = parseIntStat(statsObj, [
    "games_subs",
    "subs",
    "substitutions",
    "gamesSubs",
  ]);
  const minutes = parseIntStat(statsObj, ["minutes", "min", "Minutes"]);
  const hasAppearanceData = starts > 0 || subAppearances > 0 || minutes > 0;
  let inferredStarts = starts > 0 ? starts : minutes >= 45 ? Math.max(1, Math.floor(minutes / 90)) : 0;
  if (!hasAppearanceData) {
    // Scoutlyst-only exports often lack games started / subs columns — still pick an XI.
    inferredStarts = 1;
  }

  return {
    id: input.id,
    name: input.name,
    position: input.position,
    starts: inferredStarts,
    subAppearances,
    minutes,
    stats: input.stats,
    rating: input.rating ?? null,
  };
}

export function pickSquadFromRecords(
  records: SquadPickRecord[],
  formation: string | null | undefined,
  options?: {
    benchLimit?: number | null;
    entityType?: EntityType;
  }
): { starters: SquadPickRecord[]; substitutes: SquadPickRecord[] } {
  if (!records.length) return { starters: [], substitutes: [] };

  const idToRecord = new Map(records.map((r) => [stableNumericId(r.id), r] as const));
  const maxStarts = Math.max(1, ...records.map((r) => r.starts));
  const qualityById = new Map<number, number>();

  for (const row of records) {
    const quality =
      computePlayerPerformanceScore({
        scoutlystRating: row.rating ?? null,
        matchAvgRating: null,
        stats: row.stats,
        position: row.position,
      }) ?? 0;
    qualityById.set(stableNumericId(row.id), quality);
  }

  const pickable = records.map((r) => ({
    id: stableNumericId(r.id),
    starts: r.starts,
    subAppearances: r.subAppearances,
    fieldPosition: r.position,
    dominantPosition: () => normalizePlayerPosition(r.position),
    dominantSubRole: () => mapFieldPositionToSubRole(r.position),
  }));

  const clubMinutesById = new Map<number, number>();
  const clubRatingById = new Map<number, number>();
  for (const row of records) {
    const id = stableNumericId(row.id);
    if (row.minutes > 0) clubMinutesById.set(id, row.minutes);
    if (row.rating != null && row.rating > 0) {
      clubRatingById.set(id, row.rating <= 10 ? row.rating * 10 : row.rating);
    }
  }

  let pickedSlots = pickStartersByFormation(pickable, formation, {
    qualityById,
    entityType: options?.entityType ?? "club",
    clubMinutesById:
      options?.entityType === "national" ? clubMinutesById : undefined,
    clubRatingById:
      options?.entityType === "national" ? clubRatingById : undefined,
  });
  if (!pickedSlots.length) {
    pickedSlots = [...pickable]
      .sort((a, b) => {
        const qa = qualityById.get(a.id) ?? 0;
        const qb = qualityById.get(b.id) ?? 0;
        if (qb !== qa) return qb - qa;
        return b.starts + b.subAppearances - (a.starts + a.subAppearances);
      })
      .slice(0, 11);
  }

  const starters: SquadPickRecord[] = [];
  const starterIds = new Set<string>();

  for (const slot of pickedSlots) {
    const row = idToRecord.get(slot.id);
    if (row && !starterIds.has(row.id)) {
      starterIds.add(row.id);
      starters.push(row);
    }
  }

  const benchSorted = [...records]
    .filter((r) => !starterIds.has(r.id))
    .sort((a, b) => {
      const rankA = computeLineupRankScore({
        starts: a.starts,
        maxStarts,
        qualityScore: qualityById.get(stableNumericId(a.id)) ?? 0,
        entityType: options?.entityType ?? "club",
        clubMinutes: a.minutes,
        clubRating: a.rating ?? undefined,
      });
      const rankB = computeLineupRankScore({
        starts: b.starts,
        maxStarts,
        qualityScore: qualityById.get(stableNumericId(b.id)) ?? 0,
        entityType: options?.entityType ?? "club",
        clubMinutes: b.minutes,
        clubRating: b.rating ?? undefined,
      });
      if (rankB !== rankA) return rankB - rankA;
      if (b.minutes !== a.minutes) return b.minutes - a.minutes;
      if (b.subAppearances !== a.subAppearances) return b.subAppearances - a.subAppearances;
      return b.starts - a.starts;
    });

  const benchLimit = options?.benchLimit;
  const substitutes =
    benchLimit === null
      ? benchSorted
      : benchSorted.slice(0, benchLimit ?? 9);

  return { starters, substitutes };
}
