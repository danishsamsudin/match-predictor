import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";

export type ScoutlystSquadRow = {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: Record<string, string | number | null>;
};

const POSITION_TARGETS: Record<"G" | "D" | "M" | "F", number> = {
  G: 1,
  D: 4,
  M: 4,
  F: 2,
};

export function stableSyntheticPlayerId(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -(h >>> 0 || 1);
}

function scorePlayer(row: ScoutlystSquadRow): number {
  return (
    computePlayerPerformanceScore({
      scoutlystRating: row.rating,
      matchAvgRating: null,
      stats: row.stats,
    }) ?? 0
  );
}

/** Best-effort XI + bench when match lineups are not synced. */
export function buildSquadFromScoutlyst(players: ScoutlystSquadRow[]): {
  starters: ScoutlystSquadRow[];
  substitutes: ScoutlystSquadRow[];
} {
  if (!players.length) return { starters: [], substitutes: [] };

  const ranked = [...players]
    .map((row) => ({
      row,
      pos: normalizePlayerPosition(row.position),
      score: scorePlayer(row),
    }))
    .sort((a, b) => b.score - a.score);

  const starters: ScoutlystSquadRow[] = [];
  const used = new Set<string>();

  const takeFrom = (pos: "G" | "D" | "M" | "F", count: number) => {
    for (const entry of ranked) {
      if (starters.length >= 11) break;
      if (entry.pos !== pos) continue;
      if (used.has(entry.row.scoutlyst_player_key)) continue;
      starters.push(entry.row);
      used.add(entry.row.scoutlyst_player_key);
      if (--count <= 0) break;
    }
  };

  takeFrom("G", POSITION_TARGETS.G);
  takeFrom("D", POSITION_TARGETS.D);
  takeFrom("M", POSITION_TARGETS.M);
  takeFrom("F", POSITION_TARGETS.F);

  for (const entry of ranked) {
    if (starters.length >= 11) break;
    if (used.has(entry.row.scoutlyst_player_key)) continue;
    starters.push(entry.row);
    used.add(entry.row.scoutlyst_player_key);
  }

  const substitutes = ranked
    .filter((e) => !used.has(e.row.scoutlyst_player_key))
    .slice(0, 9)
    .map((e) => e.row);

  return { starters, substitutes };
}
