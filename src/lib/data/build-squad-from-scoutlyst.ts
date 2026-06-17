import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";
import {
  pickSquadFromRecords,
  squadPickRecordFromStats,
  type SquadPickRecord,
} from "@/lib/data/pick-squad-from-records";

export type ScoutlystSquadRow = {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: Record<string, string | number | null>;
};

export function stableSyntheticPlayerId(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -(h >>> 0 || 1);
}

/** Best-effort XI + bench when match lineups are not synced. */
export function buildSquadFromScoutlyst(
  players: ScoutlystSquadRow[],
  preferredFormation?: string | null
): {
  starters: ScoutlystSquadRow[];
  substitutes: ScoutlystSquadRow[];
} {
  if (!players.length) return { starters: [], substitutes: [] };

  const records: SquadPickRecord[] = players.map((row) =>
    squadPickRecordFromStats({
      id: row.scoutlyst_player_key,
      name: row.player_name,
      position: row.position,
      stats: row.stats,
      rating: row.rating,
    })
  );

  const { starters, substitutes } = pickSquadFromRecords(records, preferredFormation);
  const byKey = new Map(players.map((p) => [p.scoutlyst_player_key, p]));

  return {
    starters: starters.map((r) => byKey.get(r.id)!).filter(Boolean),
    substitutes: substitutes.map((r) => byKey.get(r.id)!).filter(Boolean),
  };
}

/** @deprecated Use squadPickRecordFromStats + pickSquadFromRecords */
export function scorePlayer(row: ScoutlystSquadRow): number {
  return (
    computePlayerPerformanceScore({
      scoutlystRating: row.rating,
      matchAvgRating: null,
      stats: row.stats,
      position: row.position,
    }) ?? 0
  );
}
