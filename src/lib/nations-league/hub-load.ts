import { tryCreateServiceClient } from "@/lib/supabase";
import {
  computeAllNlGroupStandings,
  groupStandingsByLeagueTier,
} from "@/lib/nations-league/standings";
import { runNlHubMainPredict } from "@/lib/nations-league/hub-main-predict";
import { buildNlHubPredictRequestFromMatch } from "@/lib/nations-league/hub-main-predict";
import { attachNlPlayerPropsToHubPrediction } from "@/lib/nations-league/attach-nl-player-props";
import { NL_COMPETITION_LABEL } from "@/lib/nations-league/group-draw";
import { compareByKickoffAsc } from "@/lib/world-cup/sort-matches";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { GroupStandingRow } from "@/lib/world-cup/standings";

export type NationsLeagueHubPayload = {
  updatedAt: string;
  competition: string;
  groupMatrixByTier: Record<string, Record<string, GroupStandingRow[]>>;
  groupMatrix: Record<string, GroupStandingRow[]>;
  recent: Array<
    WcMatchRow & {
      home_team_name: string;
      away_team_name: string;
    }
  >;
  upcoming: Array<
    WcMatchRow & {
      home_team_name: string;
      away_team_name: string;
      prediction: Record<string, unknown> | null;
      predictorUrl: string | null;
    }
  >;
};

async function loadNlMatches(
  statusFilter?: "finished" | "scheduled"
): Promise<WcMatchRow[]> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return [];

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  let query = supabase
    .from("matches")
    .select("*")
    .or(
      "competition.ilike.%Nations League%,competition.ilike.%UEFA Nations League%"
    )
    .order("date", { ascending: true });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: rows } = await query;
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    competition: row.competition,
    round: row.round,
    venue: row.venue,
    venue_city: row.venue_city ?? row.venue,
    group_code: row.group_code,
    status: row.status,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id
      ? teamNames.get(String(row.home_team_id))
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(String(row.away_team_id))
      : undefined,
  }));
}

export async function buildNationsLeagueHubPayload(): Promise<NationsLeagueHubPayload> {
  const supabase = tryCreateServiceClient();
  const allMatches = await loadNlMatches();
  const finished = allMatches.filter((m) => m.status === "finished");
  const scheduled = allMatches
    .filter((m) => m.status === "scheduled" || m.status === "timed")
    .sort(compareByKickoffAsc);

  const teamNames = new Map<string, string>();
  for (const m of allMatches) {
    if (m.home_team_id && m.home_team_name) teamNames.set(m.home_team_id, m.home_team_name);
    if (m.away_team_id && m.away_team_name) teamNames.set(m.away_team_id, m.away_team_name);
  }

  // Prefer names from nations_league_groups + teams
  if (supabase) {
    const { data: groups } = await supabase
      .from("nations_league_groups")
      .select("team_id, group_code");
    const { data: teams } = await supabase.from("teams").select("id, name");
    for (const t of teams ?? []) {
      teamNames.set(String(t.id), t.name as string);
    }
    void groups;
  }

  const groupMatrix = computeAllNlGroupStandings(finished, teamNames);
  const groupMatrixByTier = groupStandingsByLeagueTier(groupMatrix);

  const recent = finished
    .slice()
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 24)
    .map((m) => ({
      ...m,
      home_team_name: m.home_team_name ?? "Home",
      away_team_name: m.away_team_name ?? "Away",
    }));

  const predByMatch = new Map<string, Record<string, unknown>>();
  // Real-team scheduled fixtures only for hub predictions (skip knockout TBD slots)
  const predictables = scheduled.filter(
    (m) =>
      m.home_team_id &&
      m.away_team_id &&
      !String(m.home_team_id).startsWith("nl-slot:") &&
      !String(m.away_team_id).startsWith("nl-slot:")
  );

  if (supabase) {
    const ids = predictables.map((m) => m.id);
    // Supabase .in() has practical limits; chunk
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      const { data: preds } = await supabase
        .from("nations_league_predictions")
        .select("*")
        .in("match_id", chunk);
      for (const p of preds ?? []) {
        predByMatch.set(String(p.match_id), p as Record<string, unknown>);
      }
    }
  }

  const upcoming = [];
  // Show all scheduled (league + knockout placeholders); compute missing preds for near-term real fixtures
  const PREDICT_ON_LOAD_LIMIT = 24;
  let predictedNow = 0;
  for (const m of scheduled) {
    const isPlaceholder =
      !m.home_team_id ||
      !m.away_team_id ||
      String(m.home_team_id).startsWith("nl-slot:") ||
      String(m.away_team_id).startsWith("nl-slot:");

    let raw = predByMatch.get(m.id) ?? null;
    if (!raw && !isPlaceholder && supabase && predictedNow < PREDICT_ON_LOAD_LIMIT) {
      const computedBase = await runNlHubMainPredict(m, { finishedMatches: finished });
      const computed = computedBase
        ? await attachNlPlayerPropsToHubPrediction(m, computedBase)
        : null;
      if (computed) {
        predictedNow += 1;
        raw = {
          match_id: m.id,
          ...computed,
        };
        await supabase.from("nations_league_predictions").upsert({
          match_id: m.id,
          home_win_pct: computed.home_win_pct,
          draw_pct: computed.draw_pct,
          away_win_pct: computed.away_win_pct,
          predicted_score_home: computed.predicted_score_home,
          predicted_score_away: computed.predicted_score_away,
          under_2_5_pct: computed.under_2_5_pct,
          over_2_5_pct: computed.over_2_5_pct,
          model_version: computed.model_version,
          snapshot: computed.snapshot,
        });
      }
    }
    const prediction = raw
      ? {
          home_win_pct: Number(raw.home_win_pct),
          draw_pct: Number(raw.draw_pct),
          away_win_pct: Number(raw.away_win_pct),
          under_2_5_pct: Number(raw.under_2_5_pct),
          over_2_5_pct: Number(raw.over_2_5_pct),
          predicted_score_home: Number(raw.predicted_score_home),
          predicted_score_away: Number(raw.predicted_score_away),
          snapshot: (raw.snapshot as Record<string, unknown>) ?? {},
          computed_at: (raw.computed_at as string) ?? null,
        }
      : null;
    const req = isPlaceholder ? null : buildNlHubPredictRequestFromMatch(m);
    const timeForUrl =
      typeof m.time === "string" && /^\d{1,2}:\d{2}/.test(m.time)
        ? m.time.slice(0, 5)
        : m.time;
    const predictorUrl = req
      ? `/predict?entity=national&mode=compare&home=${req.homeTeamId}&away=${req.awayTeamId}&date=${req.matchDate}&league=${req.homeLeagueId}&homeName=${encodeURIComponent(req.homeTeamName ?? "")}&awayName=${encodeURIComponent(req.awayTeamName ?? "")}&city=${encodeURIComponent(req.city ?? "London")}${timeForUrl ? `&time=${encodeURIComponent(timeForUrl)}` : ""}`
      : null;

    upcoming.push({
      ...m,
      home_team_name: m.home_team_name ?? "Home",
      away_team_name: m.away_team_name ?? "Away",
      prediction,
      predictorUrl,
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    competition: NL_COMPETITION_LABEL,
    groupMatrixByTier,
    groupMatrix,
    recent,
    upcoming,
  };
}

export async function loadNationsLeagueHubPayload(): Promise<NationsLeagueHubPayload | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    try {
      return await buildNationsLeagueHubPayload();
    } catch {
      return null;
    }
  }

  const { data: snap } = await supabase
    .from("nations_league_hub_snapshot")
    .select("payload, computed_at")
    .eq("id", "latest")
    .maybeSingle();

  if (snap?.payload) {
    return snap.payload as NationsLeagueHubPayload;
  }

  try {
    const payload = await buildNationsLeagueHubPayload();
    await supabase.from("nations_league_hub_snapshot").upsert({
      id: "latest",
      payload,
      computed_at: new Date().toISOString(),
      refresh_status: "idle",
      updated_at: new Date().toISOString(),
    });
    return payload;
  } catch (err) {
    console.error("NL hub build failed", err);
    return null;
  }
}

export async function fillNlLeaguePhasePredictions(options?: {
  limit?: number;
}): Promise<{ predicted: number; skipped: number }> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return { predicted: 0, skipped: 0 };

  const allMatches = await loadNlMatches();
  const finished = allMatches.filter((m) => m.status === "finished");
  const scheduled = allMatches
    .filter((m) => m.status === "scheduled" || m.status === "timed")
    .filter(
      (m) =>
        m.home_team_id &&
        m.away_team_id &&
        !String(m.home_team_id).startsWith("nl-slot:") &&
        !String(m.away_team_id).startsWith("nl-slot:")
    )
    .sort(compareByKickoffAsc);

  const limit = options?.limit ?? scheduled.length;
  const targets = scheduled.slice(0, limit);

  const existing = new Set<string>();
  for (let i = 0; i < targets.length; i += 80) {
    const chunk = targets.slice(i, i + 80).map((m) => m.id);
    const { data } = await supabase
      .from("nations_league_predictions")
      .select("match_id")
      .in("match_id", chunk);
    for (const row of data ?? []) existing.add(String(row.match_id));
  }

  let predicted = 0;
  let skipped = 0;
  for (const m of targets) {
    if (existing.has(m.id)) {
      skipped += 1;
      continue;
    }
    const computedBase = await runNlHubMainPredict(m, { finishedMatches: finished });
    const computed = computedBase
      ? await attachNlPlayerPropsToHubPrediction(m, computedBase)
      : null;
    if (!computed) {
      skipped += 1;
      continue;
    }
    await supabase.from("nations_league_predictions").upsert({
      match_id: m.id,
      home_win_pct: computed.home_win_pct,
      draw_pct: computed.draw_pct,
      away_win_pct: computed.away_win_pct,
      predicted_score_home: computed.predicted_score_home,
      predicted_score_away: computed.predicted_score_away,
      under_2_5_pct: computed.under_2_5_pct,
      over_2_5_pct: computed.over_2_5_pct,
      model_version: computed.model_version,
      snapshot: computed.snapshot,
    });
    predicted += 1;
  }
  return { predicted, skipped };
}

export async function refreshNationsLeagueHubSnapshot(): Promise<NationsLeagueHubPayload | null> {
  const supabase = tryCreateServiceClient();
  if (supabase) {
    await supabase
      .from("nations_league_hub_snapshot")
      .update({ refresh_status: "running", updated_at: new Date().toISOString() })
      .eq("id", "latest");
  }
  try {
    // Pre-compute lines for all real league-phase fixtures so hub cards are ready
    await fillNlLeaguePhasePredictions();
    const payload = await buildNationsLeagueHubPayload();
    if (supabase) {
      await supabase.from("nations_league_hub_snapshot").upsert({
        id: "latest",
        payload,
        computed_at: new Date().toISOString(),
        refresh_status: "idle",
        last_manual_refresh_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return payload;
  } catch (err) {
    if (supabase) {
      await supabase
        .from("nations_league_hub_snapshot")
        .update({
          refresh_status: "failed",
          refresh_errors: [{ message: String(err) }],
          updated_at: new Date().toISOString(),
        })
        .eq("id", "latest");
    }
    throw err;
  }
}
