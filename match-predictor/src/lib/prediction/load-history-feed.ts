import { resolvePredictionTeamNamesBatch } from "@/lib/prediction/resolve-team-names";
import {
  kindMetaForStoredPrediction,
  worldCupHubKindMeta,
  type PredictionHistoryKindMeta,
} from "@/lib/prediction/history-kind";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HistoryFeedItem = {
  key: string;
  href: string;
  homeTeamName: string;
  awayTeamName: string;
  city: string;
  matchDate: string;
  /** UTC ISO — when the model run was stored. */
  predictedAt: string;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  homeXg: number | null;
  awayXg: number | null;
  predictedScoreHome: number | null;
  predictedScoreAway: number | null;
  kind: PredictionHistoryKindMeta;
  fixtureLabel: string | null;
};

function asPercent(value: number, isFraction: boolean): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const pct = isFraction && n <= 1 ? n * 100 : n;
  return Math.round(pct * 10) / 10;
}

function kickoffIso(date: string | null, time: string | null): string {
  if (!date) return new Date(0).toISOString();
  const t = time?.trim();
  if (t && /^\d{1,2}:\d{2}/.test(t)) {
    return `${date}T${t.length === 5 ? `${t}:00` : t}`;
  }
  return `${date}T12:00:00`;
}

export async function loadPredictionHistoryFeed(
  supabase: SupabaseClient,
  limit = 50
): Promise<HistoryFeedItem[]> {
  const [storedRes, wcPredRes] = await Promise.all([
    supabase
      .from("predictions")
      .select(
        "id, match_id, home_team_id, away_team_id, home_league_id, away_league_id, entity_type, comparison_mode, inputs_snapshot, city, match_date, home_win_pct, away_win_pct, draw_pct, home_xg, away_xg, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("world_cup_predictions")
      .select(
        "match_id, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, computed_at"
      )
      .order("computed_at", { ascending: false })
      .limit(limit),
  ]);

  const storedRows = storedRes.error ? [] : (storedRes.data ?? []);
  const teamNames = await resolvePredictionTeamNamesBatch(supabase, storedRows);

  const storedItems: HistoryFeedItem[] = storedRows.map((p) => {
    const names = teamNames.get(p.id) ?? {
      homeTeamName: `Team ${p.home_team_id}`,
      awayTeamName: `Team ${p.away_team_id}`,
    };
    const kind = kindMetaForStoredPrediction(p);
    const fixtureLabel =
      p.match_id > 0 ? `Fixture #${p.match_id}` : null;

    return {
      key: `stored:${p.id}`,
      href: `/predictions/${p.id}`,
      homeTeamName: names.homeTeamName,
      awayTeamName: names.awayTeamName,
      city: p.city,
      matchDate: p.match_date,
      predictedAt: p.created_at,
      homeWinPct: asPercent(p.home_win_pct, false),
      drawPct: asPercent(p.draw_pct, false),
      awayWinPct: asPercent(p.away_win_pct, false),
      homeXg: Number(p.home_xg),
      awayXg: Number(p.away_xg),
      predictedScoreHome: null,
      predictedScoreAway: null,
      kind,
      fixtureLabel,
    };
  });

  const wcPredRows = (wcPredRes.error ? [] : (wcPredRes.data ?? [])) as Array<{
    match_id: string;
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    predicted_score_home: number;
    predicted_score_away: number;
    computed_at: string | null;
  }>;

  if (wcPredRows.length === 0) {
    return storedItems
      .sort((a, b) => b.predictedAt.localeCompare(a.predictedAt))
      .slice(0, limit);
  }

  const matchIds = wcPredRows.map((r) => r.match_id);
  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, date, time, venue, venue_city, home_team_id, away_team_id")
    .in("id", matchIds);

  const teamIds = new Set<string>();
  for (const m of matchRows ?? []) {
    if (m.home_team_id) teamIds.add(m.home_team_id);
    if (m.away_team_id) teamIds.add(m.away_team_id);
  }

  const { data: teamRows } =
    teamIds.size > 0
      ? await supabase.from("teams").select("id, name").in("id", [...teamIds])
      : { data: [] };

  const teamNameById = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const matchById = new Map((matchRows ?? []).map((m) => [m.id, m]));

  const wcItems: HistoryFeedItem[] = [];
  for (const pred of wcPredRows) {
    const match = matchById.get(pred.match_id);
    if (!match) continue;

    const homeName = match.home_team_id
      ? (teamNameById.get(match.home_team_id) ?? "Home")
      : "Home";
    const awayName = match.away_team_id
      ? (teamNameById.get(match.away_team_id) ?? "Away")
      : "Away";
    const city =
      (match.venue_city as string | null)?.trim() ||
      (match.venue as string | null)?.trim() ||
      "Neutral";

    wcItems.push({
      key: `wc:${pred.match_id}`,
      href: "/world-cup",
      homeTeamName: homeName,
      awayTeamName: awayName,
      city,
      matchDate: kickoffIso(match.date, match.time as string | null),
      predictedAt: pred.computed_at ?? new Date(0).toISOString(),
      homeWinPct: asPercent(pred.home_win_pct, true),
      drawPct: asPercent(pred.draw_pct, true),
      awayWinPct: asPercent(pred.away_win_pct, true),
      homeXg: null,
      awayXg: null,
      predictedScoreHome: pred.predicted_score_home,
      predictedScoreAway: pred.predicted_score_away,
      kind: worldCupHubKindMeta(),
      fixtureLabel: null,
    });
  }

  return [...storedItems, ...wcItems]
    .sort((a, b) => b.predictedAt.localeCompare(a.predictedAt))
    .slice(0, limit);
}
