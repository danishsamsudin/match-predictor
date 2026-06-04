import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import type { LineupAppearanceAgg } from "@/lib/data/infer-usual-squad-from-lineups";
import {
  maxPerformanceInputs,
  resolveScoutlystSnapshot,
  resolveSofifaOverall,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";

export function buildLineupQualityMap(
  players: LineupAppearanceAgg[],
  ctx: {
    bySofascoreId: Map<number, ScoutlystSnapshotRow>;
    byName: Map<string, ScoutlystSnapshotRow>;
    globalByName: Map<string, ScoutlystSnapshotRow>;
    matchRatings: Map<number, number>;
    sofifaByName: Map<string, number>;
    sofifaGlobalByName: Map<string, number>;
  }
): Map<number, number> {
  const qualityById = new Map<number, number>();
  for (const p of players) {
    const displayName = formatPlayerDisplayNameIfNeeded(p.name);
    const scout =
      ctx.bySofascoreId.get(p.sofascorePlayerId) ??
      resolveScoutlystSnapshot(displayName, ctx.byName) ??
      resolveScoutlystSnapshot(displayName, ctx.globalByName) ??
      null;
    const position = p.fieldPosition ?? scout?.position ?? p.position;
    const fromStats = computePlayerPerformanceScore({
      scoutlystRating: scout?.rating ?? null,
      matchAvgRating: ctx.matchRatings.get(p.sofascorePlayerId) ?? null,
      stats: scout?.stats ?? {},
      position,
    });
    const sofifaOverall = resolveSofifaOverall(
      displayName,
      ctx.sofifaGlobalByName,
      ctx.sofifaByName
    );
    const fromSofifa =
      sofifaOverall != null ? sofifaOverallToScore(sofifaOverall) : null;
    const score = maxPerformanceInputs(fromStats, fromSofifa);
    if (score != null && score > 0) qualityById.set(p.sofascorePlayerId, score);
  }
  return qualityById;
}
