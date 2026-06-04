import type { ScoutlystSnapshotRow } from "@/lib/data/resolve-squad-player-metrics";

function parseMinutes(stats: Record<string, string | number | null>): number {
  for (const key of ["minutes", "min", "Minutes"]) {
    const raw = stats[key];
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

export function buildClubMetricsBySofascoreId(
  bySofascoreId: Map<number, ScoutlystSnapshotRow>
): { clubMinutesById: Map<number, number>; clubRatingById: Map<number, number> } {
  const clubMinutesById = new Map<number, number>();
  const clubRatingById = new Map<number, number>();

  for (const [id, row] of bySofascoreId) {
    const minutes = parseMinutes(row.stats ?? {});
    if (minutes > 0) clubMinutesById.set(id, minutes);
    if (row.rating != null && row.rating > 0) {
      clubRatingById.set(id, row.rating <= 10 ? row.rating * 10 : row.rating);
    }
  }

  return { clubMinutesById, clubRatingById };
}
