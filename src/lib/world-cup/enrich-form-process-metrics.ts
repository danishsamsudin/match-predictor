import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { NationalMatchProcessRow } from "@/lib/data/match-process-metrics";

function formMatchKey(m: InternationalFormMatch): string {
  return `${m.date ?? ""}|${m.home_team_id ?? ""}|${m.away_team_id ?? ""}`;
}

export function mergeProcessMetricsIntoFormMatch(
  match: InternationalFormMatch,
  row: NationalMatchProcessRow
): InternationalFormMatch {
  return {
    ...match,
    event_id: match.event_id ?? row.event_id,
    home_xg: row.home_xg ?? match.home_xg,
    away_xg: row.away_xg ?? match.away_xg,
    home_shots: row.home_shots ?? match.home_shots,
    away_shots: row.away_shots ?? match.away_shots,
    home_sot: row.home_sot ?? match.home_sot,
    away_sot: row.away_sot ?? match.away_sot,
  };
}

export function enrichFormMatchesWithProcessMetrics(
  matches: InternationalFormMatch[],
  metrics: NationalMatchProcessRow[]
): InternationalFormMatch[] {
  const byEventId = new Map<number, NationalMatchProcessRow>();
  const byKey = new Map<string, NationalMatchProcessRow>();

  for (const row of metrics) {
    byEventId.set(row.event_id, row);
    if (row.match_date && row.home_team_id && row.away_team_id) {
      byKey.set(`${row.match_date}|${row.home_team_id}|${row.away_team_id}`, row);
      byKey.set(`${row.match_date}|${row.away_team_id}|${row.home_team_id}`, row);
    }
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
