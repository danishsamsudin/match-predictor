import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { NationalMatchProcessRow } from "@/lib/data/match-process-metrics";

export type MatchProcessPayload = {
  schema?: string;
  home?: Record<string, number>;
  away?: Record<string, number>;
};

/** Higher rank wins when multiple sources cover the same fixture. */
const SOURCE_PRIORITY: Record<string, number> = {
  opta_html: 4,
  sofascore: 3,
  statsbomb: 2,
  fbref: 1,
  fbref_goals_proxy: 0,
};

function sourceRank(source: string | null | undefined): number {
  if (!source) return -1;
  return SOURCE_PRIORITY[source] ?? 0;
}

function formMatchKey(m: InternationalFormMatch): string {
  return `${m.date ?? ""}|${m.home_team_id ?? ""}|${m.away_team_id ?? ""}`;
}

function metricsDateKey(row: NationalMatchProcessRow): string | null {
  if (!row.match_date || !row.home_team_id || !row.away_team_id) return null;
  return `${row.match_date}|${row.home_team_id}|${row.away_team_id}`;
}

function extractProcessPayload(row: NationalMatchProcessRow): MatchProcessPayload | null {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const process = (payload as Record<string, unknown>).process;
  if (!process || typeof process !== "object") return null;
  return process as MatchProcessPayload;
}

function pickPreferredRow(
  existing: NationalMatchProcessRow,
  incoming: NationalMatchProcessRow
): NationalMatchProcessRow {
  const existingRank = sourceRank(existing.source);
  const incomingRank = sourceRank(incoming.source);
  if (incomingRank > existingRank) return incoming;
  if (incomingRank < existingRank) return existing;
  return (incoming.match_date ?? "") >= (existing.match_date ?? "") ? incoming : existing;
}

export function mergeProcessMetricsIntoFormMatch(
  match: InternationalFormMatch,
  row: NationalMatchProcessRow
): InternationalFormMatch {
  const processPayload = extractProcessPayload(row);
  return {
    ...match,
    event_id: match.event_id ?? row.event_id,
    home_xg: row.home_xg ?? match.home_xg,
    away_xg: row.away_xg ?? match.away_xg,
    home_shots: row.home_shots ?? match.home_shots,
    away_shots: row.away_shots ?? match.away_shots,
    home_sot: row.home_sot ?? match.home_sot,
    away_sot: row.away_sot ?? match.away_sot,
    processPayload: processPayload ?? match.processPayload ?? null,
    metricsSource: row.source ?? match.metricsSource,
  };
}

export function enrichFormMatchesWithProcessMetrics(
  matches: InternationalFormMatch[],
  metrics: NationalMatchProcessRow[]
): InternationalFormMatch[] {
  const byEventId = new Map<number, NationalMatchProcessRow>();
  const byKey = new Map<string, NationalMatchProcessRow>();

  for (const row of metrics) {
    const prevById = byEventId.get(row.event_id);
    byEventId.set(row.event_id, prevById ? pickPreferredRow(prevById, row) : row);

    const key = metricsDateKey(row);
    if (!key) continue;
    const prevByKey = byKey.get(key);
    byKey.set(key, prevByKey ? pickPreferredRow(prevByKey, row) : row);

    const reverseKey = `${row.match_date}|${row.away_team_id}|${row.home_team_id}`;
    const prevRev = byKey.get(reverseKey);
    byKey.set(reverseKey, prevRev ? pickPreferredRow(prevRev, row) : row);
  }

  return matches.map((m) => {
    if (m.event_id != null) {
      const byId = byEventId.get(m.event_id);
      if (byId) return mergeProcessMetricsIntoFormMatch(m, byId);
    }
    const byDate = byKey.get(formMatchKey(m));
    if (byDate) return mergeProcessMetricsIntoFormMatch(m, byDate);
    return m;
  });
}

export { sourceRank as processMetricsSourceRank };
