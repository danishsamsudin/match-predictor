import { tryCreateServiceClient } from "@/lib/supabase";
import {
  computeAllNlGroupStandings,
  groupStandingsByLeagueTier,
} from "@/lib/nations-league/standings";
import { runNlHubMainPredict } from "@/lib/nations-league/hub-main-predict";
import { buildNlHubPredictRequestFromMatch } from "@/lib/nations-league/hub-main-predict";
import { attachNlPlayerPropsToHubPrediction } from "@/lib/nations-league/attach-nl-player-props";
import { loadNlCalibrationConfig } from "@/lib/nations-league/nl-calibration-config";
import { enrichHubPredictionWithMarketModels } from "@/lib/world-cup/market-models/enrich-hub-prediction";
import { NL_COMPETITION_LABEL } from "@/lib/nations-league/group-draw";
import {
  nlKickoffUtcIso,
  resolveNlMatchPhase,
  shouldRefreshNlPrediction,
} from "@/lib/nations-league/nl-match-phase";
import { compareByKickoffAsc } from "@/lib/world-cup/sort-matches";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
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

/**
 * Price a fixture and stamp the snapshot with when it was locked, so post-match scoring
 * can prove the numbers it grades were published before kickoff.
 */
async function buildNlLockedPrediction(
  match: WcMatchRow,
  context: {
    finished: WcMatchRow[];
    standings?: GroupStandingRow[];
    now: Date;
  }
): Promise<HubPredictionRow | null> {
  const base = await runNlHubMainPredict(match, {
    finishedMatches: context.finished,
    standings: context.standings,
  });
  if (!base) return null;

  const withProps = await attachNlPlayerPropsToHubPrediction(match, base);
  const calibration = await loadNlCalibrationConfig();
  const enriched = enrichHubPredictionWithMarketModels({
    hubRow: withProps,
    calibration,
    homeName: match.home_team_name ?? "Home",
    awayName: match.away_team_name ?? "Away",
  }).hubRow;
  return {
    ...enriched,
    snapshot: {
      ...enriched.snapshot,
      lock_state: "pre",
      locked_at: context.now.toISOString(),
      kickoff_utc: nlKickoffUtcIso({ date: match.date, time: match.time }),
    },
  };
}

function nlPredictionUpsertRow(matchId: string, computed: HubPredictionRow) {
  return {
    match_id: matchId,
    home_win_pct: computed.home_win_pct,
    draw_pct: computed.draw_pct,
    away_win_pct: computed.away_win_pct,
    predicted_score_home: computed.predicted_score_home,
    predicted_score_away: computed.predicted_score_away,
    under_2_5_pct: computed.under_2_5_pct,
    over_2_5_pct: computed.over_2_5_pct,
    model_version: computed.model_version,
    snapshot: computed.snapshot,
  };
}

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
      const computed = await buildNlLockedPrediction(m, {
        finished,
        standings: groupMatrix[m.group_code ?? ""],
        now: new Date(),
      });
      if (computed) {
        predictedNow += 1;
        raw = {
          match_id: m.id,
          ...computed,
        };
        await supabase
          .from("nations_league_predictions")
          .upsert(nlPredictionUpsertRow(m.id, computed));
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

export type NlLockFillResult = {
  /** Fixtures that had no locked line before this run. */
  predicted: number;
  /** Pre-kickoff fixtures whose existing line was recomputed with the newest form. */
  refreshed: number;
  /** Fixtures already kicked off: their locked line is left untouched. */
  frozen: number;
  /** Fixtures the model could not price (missing team ids, squads, or form). */
  skipped: number;
};

/**
 * Lock (and keep refreshing) Graham + player-prop lines for upcoming fixtures.
 *
 * A line stays open to recomputation for as long as the fixture has not kicked off, so the
 * published numbers always use the freshest ratings. Once the match starts, the snapshot is
 * frozen - post-match evaluation must score what was actually published before kickoff.
 */
export async function fillNlLeaguePhasePredictions(options?: {
  limit?: number;
  now?: Date;
}): Promise<NlLockFillResult> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return { predicted: 0, refreshed: 0, frozen: 0, skipped: 0 };

  const now = options?.now ?? new Date();
  const allMatches = await loadNlMatches();
  const finished = allMatches.filter((m) => m.status === "finished");

  const teamNames = new Map<string, string>();
  for (const m of allMatches) {
    if (m.home_team_id && m.home_team_name) teamNames.set(m.home_team_id, m.home_team_name);
    if (m.away_team_id && m.away_team_name) teamNames.set(m.away_team_id, m.away_team_name);
  }
  const standingsByGroup = computeAllNlGroupStandings(finished, teamNames);

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

  const result: NlLockFillResult = { predicted: 0, refreshed: 0, frozen: 0, skipped: 0 };
  for (const m of targets) {
    const phase = resolveNlMatchPhase(
      {
        status: m.status,
        homeGoals: m.home_goals,
        awayGoals: m.away_goals,
        date: m.date,
        time: m.time,
      },
      now
    );
    const hadLock = existing.has(m.id);

    if (!shouldRefreshNlPrediction(phase)) {
      if (hadLock) result.frozen += 1;
      else result.skipped += 1;
      continue;
    }

    const computed = await buildNlLockedPrediction(m, {
      finished,
      standings: standingsByGroup[m.group_code ?? ""],
      now,
    });
    if (!computed) {
      result.skipped += 1;
      continue;
    }

    await supabase.from("nations_league_predictions").upsert(
      nlPredictionUpsertRow(m.id, computed)
    );
    if (hadLock) result.refreshed += 1;
    else result.predicted += 1;
  }
  return result;
}

export async function refreshNationsLeagueHubSnapshot(options?: {
  /** When true, skip fillNlLeaguePhasePredictions (caller already filled). */
  skipFill?: boolean;
}): Promise<NationsLeagueHubPayload | null> {
  const supabase = tryCreateServiceClient();
  if (supabase) {
    await supabase
      .from("nations_league_hub_snapshot")
      .update({ refresh_status: "running", updated_at: new Date().toISOString() })
      .eq("id", "latest");
  }
  try {
    // Pre-compute lines for all real league-phase fixtures so hub cards are ready
    if (!options?.skipFill) {
      await fillNlLeaguePhasePredictions();
    }
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
