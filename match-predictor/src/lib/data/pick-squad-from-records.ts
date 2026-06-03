import {
  computeLineupRankScore,
  pickStartersByFormation,
} from "@/lib/data/formation-lineup";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";
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
  const inferredStarts = starts > 0 ? starts : minutes >= 45 ? 1 : 0;

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
  options?: { benchLimit?: number | null }
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
    dominantPosition: () => normalizePlayerPosition(r.position),
  }));

  const pickedSlots = pickStartersByFormation(pickable, formation, { qualityById });
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
      const rankA = computeLineupRankScore(
        a.starts,
        maxStarts,
        qualityById.get(stableNumericId(a.id)) ?? 0
      );
      const rankB = computeLineupRankScore(
        b.starts,
        maxStarts,
        qualityById.get(stableNumericId(b.id)) ?? 0
      );
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
