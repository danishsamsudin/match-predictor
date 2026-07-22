/**
 * Post-results GLPM refresh: full engine retrain for leagues that played,
 * then force-rescore upcoming fixtures (1X2, BTTS, O/U, xG).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import { tryCreateServiceClient } from "../../supabase";
import {
  DEFAULT_GLPM_SEASON_IDS_2026_27,
  SM_LEAGUE,
  SM_SEASON_2025_26,
  SM_SEASON_2026_27,
} from "../../sportmonks/constants";
import { formatDateInTimeZone, resolveMatchdayTimeZone } from "./matchday";
import { loadDailySyncWindow, patchDailySyncWindow } from "./dailySyncWindow";
import { runGlpmUpcomingPredictionSnapshots } from "../run-upcoming-prediction-snapshots";

type Client = SupabaseClient<Database>;

const TRAIN_SCRIPTS = [
  "glpm:attack-train",
  "glpm:defence-train",
  "glpm:goalkeeper-train",
  "glpm:build-up-train",
  "glpm:possession-train",
  "glpm:pressing-train",
  "glpm:finishing-train",
] as const;

/** Prefer active 2026/27; fall back to last finished season when none played yet. */
const TRAIN_FALLBACK_BY_LEAGUE: Partial<Record<number, number>> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: SM_SEASON_2025_26.PREMIER_LEAGUE,
};

export type NightRefreshOptions = {
  matchDate?: string;
  timeZone?: string;
  dryRun?: boolean;
  skipTrain?: boolean;
  skipPredict?: boolean;
  supabase?: Client;
  /** Override seasons to train (skips auto-detect). */
  seasonIds?: number[];
  cwd?: string;
};

export type NightRefreshSummary = {
  ok: boolean;
  matchDate: string;
  timeZone: string;
  dryRun: boolean;
  seasonsTrained: number[];
  seasonsSkipped: Array<{ seasonId: number; reason: string }>;
  train: Array<{ seasonId: number; script: string; ok: boolean; detail?: string }>;
  predictions?: Awaited<ReturnType<typeof runGlpmUpcomingPredictionSnapshots>>;
  notes: string[];
};

function runNpm(
  script: string,
  args: string[],
  cwd: string
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", script, "--", ...args], {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

async function seasonHasFinishedMatches(
  client: Client,
  seasonId: number
): Promise<boolean> {
  const { count } = await client
    .from("glpm_matches")
    .select("sm_id", { count: "exact", head: true })
    .eq("season_id", seasonId)
    .not("home_score", "is", null);
  return (count ?? 0) > 0;
}

async function seasonsWithFinishedOnDate(
  client: Client,
  matchDate: string,
  fixtureIds: number[]
): Promise<number[]> {
  if (!fixtureIds.length) return [];
  const { data } = await client
    .from("glpm_matches")
    .select("season_id,home_score,away_score,match_date")
    .in("sm_id", fixtureIds);
  const seasons = new Set<number>();
  for (const row of data ?? []) {
    if (row.season_id == null) continue;
    const finished = row.home_score != null && row.away_score != null;
    const onDay = row.match_date === matchDate;
    if (finished || onDay) seasons.add(row.season_id);
  }
  return [...seasons];
}

/**
 * Pick train season: preferred 2026/27 if it has finished matches, else fallback / DB latest.
 */
export async function resolveTrainSeasonId(
  client: Client,
  preferredSeasonId: number,
  leagueId?: number
): Promise<{ seasonId: number; reason: string }> {
  if (await seasonHasFinishedMatches(client, preferredSeasonId)) {
    return { seasonId: preferredSeasonId, reason: "preferred_has_finished" };
  }
  const fallback = leagueId != null ? TRAIN_FALLBACK_BY_LEAGUE[leagueId] : undefined;
  if (fallback != null && (await seasonHasFinishedMatches(client, fallback))) {
    return { seasonId: fallback, reason: `fallback_${fallback}` };
  }

  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id,competition_id,start_date")
    .order("start_date", { ascending: false });

  const preferredMeta = (seasons ?? []).find((s) => s.sm_id === preferredSeasonId);
  const competitionId = preferredMeta?.competition_id ?? leagueId ?? null;
  const pool =
    competitionId != null
      ? (seasons ?? []).filter((s) => s.competition_id === competitionId)
      : (seasons ?? []);

  for (const s of pool) {
    if (await seasonHasFinishedMatches(client, s.sm_id)) {
      return { seasonId: s.sm_id, reason: `latest_finished_${s.sm_id}` };
    }
  }
  return { seasonId: preferredSeasonId, reason: "preferred_no_finished_yet" };
}

export async function runGlpmNightRefresh(
  options: NightRefreshOptions = {}
): Promise<NightRefreshSummary> {
  const notes: string[] = [];
  const timeZone = resolveMatchdayTimeZone(options.timeZone);
  const matchDate =
    options.matchDate ?? formatDateInTimeZone(new Date(), timeZone);
  const dryRun = Boolean(options.dryRun);
  const cwd = options.cwd ?? process.cwd();
  const supabase = options.supabase ?? tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const window = await loadDailySyncWindow(supabase, matchDate);
  if (window?.refresh_done) {
    return {
      ok: true,
      matchDate,
      timeZone,
      dryRun,
      seasonsTrained: [],
      seasonsSkipped: [],
      train: [],
      notes: ["Refresh already done for this matchday"],
    };
  }
  if (window?.empty_matchday) {
    if (!dryRun) {
      await patchDailySyncWindow(supabase, matchDate, {
        refresh_done: true,
        refresh_summary: { skipped: true, reason: "empty_matchday" },
      });
    }
    return {
      ok: true,
      matchDate,
      timeZone,
      dryRun,
      seasonsTrained: [],
      seasonsSkipped: [],
      train: [],
      notes: ["Empty matchday — refresh marked done"],
    };
  }

  const playedSeasonIds =
    options.seasonIds ??
    (window
      ? await seasonsWithFinishedOnDate(supabase, matchDate, window.fixture_ids)
      : []);

  const preferredByLeague = Object.values(SM_SEASON_2026_27);
  const candidates =
    playedSeasonIds.length > 0 ? playedSeasonIds : preferredByLeague;

  const seasonsTrained: number[] = [];
  const seasonsSkipped: Array<{ seasonId: number; reason: string }> = [];
  const trainLog: NightRefreshSummary["train"] = [];

  if (options.skipTrain) {
    notes.push("skipTrain=true");
  } else if (!playedSeasonIds.length && !options.seasonIds) {
    notes.push("No finished fixtures on slate — skipping train");
    for (const s of DEFAULT_GLPM_SEASON_IDS_2026_27) {
      seasonsSkipped.push({ seasonId: s, reason: "no_finished_on_matchday" });
    }
  } else {
    const leagueBySeason = new Map<number, number>([
      [SM_SEASON_2026_27.PREMIER_LEAGUE, SM_LEAGUE.PREMIER_LEAGUE],
      [SM_SEASON_2026_27.EREDIVISIE, SM_LEAGUE.EREDIVISIE],
      [SM_SEASON_2026_27.CHAMPIONSHIP, SM_LEAGUE.CHAMPIONSHIP],
      [SM_SEASON_2026_27.SERIE_A, SM_LEAGUE.SERIE_A],
      [SM_SEASON_2026_27.BUNDESLIGA, SM_LEAGUE.BUNDESLIGA],
    ]);

    const resolved = new Set<number>();
    for (const preferred of candidates) {
      const leagueId = leagueBySeason.get(preferred);
      const pick = await resolveTrainSeasonId(supabase, preferred, leagueId);
      if (!(await seasonHasFinishedMatches(supabase, pick.seasonId))) {
        seasonsSkipped.push({
          seasonId: preferred,
          reason: "no_finished_matches_for_train",
        });
        continue;
      }
      resolved.add(pick.seasonId);
      notes.push(`Train season ${pick.seasonId} (${pick.reason}) for preferred ${preferred}`);
    }

    for (const seasonId of resolved) {
      if (dryRun) {
        seasonsTrained.push(seasonId);
        trainLog.push({
          seasonId,
          script: "(dry-run)",
          ok: true,
          detail: "would train 7 engines + assemble + bayesian",
        });
        continue;
      }

      let seasonOk = true;
      for (const script of TRAIN_SCRIPTS) {
        const out = await runNpm(script, ["--season-id", String(seasonId)], cwd);
        const ok = out.status === 0;
        trainLog.push({
          seasonId,
          script,
          ok,
          detail: ok ? undefined : (out.stderr || out.stdout).slice(-500),
        });
        if (!ok) {
          seasonOk = false;
          notes.push(`FAILED ${script} season ${seasonId}`);
          break;
        }
      }
      if (!seasonOk) continue;

      const assemble = await runNpm(
        "glpm:assemble-vectors",
        ["--season-id", String(seasonId)],
        cwd
      );
      trainLog.push({
        seasonId,
        script: "glpm:assemble-vectors",
        ok: assemble.status === 0,
        detail:
          assemble.status === 0
            ? undefined
            : (assemble.stderr || assemble.stdout).slice(-500),
      });
      if (assemble.status !== 0) {
        notes.push(`FAILED assemble-vectors season ${seasonId}`);
        continue;
      }

      const bayes = await runNpm(
        "glpm:bayesian-update",
        ["--season-id", String(seasonId), "--half-life", "90"],
        cwd
      );
      trainLog.push({
        seasonId,
        script: "glpm:bayesian-update",
        ok: bayes.status === 0,
        detail:
          bayes.status === 0
            ? "ok"
            : `warning: ${(bayes.stderr || bayes.stdout).slice(-300)}`,
      });
      // Bayesian failure is non-fatal (same as league-run).
      seasonsTrained.push(seasonId);
    }
  }

  let predictions: NightRefreshSummary["predictions"];
  if (!options.skipPredict) {
    if (dryRun) {
      notes.push("dryRun — skip upcoming predictions");
    } else {
      predictions = await runGlpmUpcomingPredictionSnapshots({
        client: supabase,
        force: true,
        maxPerCompetition: 48,
      });
      notes.push(
        `Upcoming predictions written=${predictions.predictionsWritten} attempted=${predictions.fixturesAttempted}`
      );
    }
  } else {
    notes.push("skipPredict=true");
  }

  const trainFailed = trainLog.some((t) => !t.ok && t.script !== "glpm:bayesian-update");
  const predictFailed = predictions ? !predictions.ok : false;
  const ok = !trainFailed && !predictFailed;

  if (!dryRun && ok) {
    await patchDailySyncWindow(supabase, matchDate, {
      refresh_done: true,
      refresh_summary: {
        seasonsTrained,
        seasonsSkipped,
        train: trainLog,
        predictions,
      },
    });
  } else if (!dryRun && !ok) {
    await patchDailySyncWindow(supabase, matchDate, {
      refresh_summary: {
        ok: false,
        seasonsTrained,
        seasonsSkipped,
        train: trainLog,
        predictions,
      },
    });
    notes.push("Refresh NOT marked done — dispatcher will retry");
  }

  return {
    ok,
    matchDate,
    timeZone,
    dryRun,
    seasonsTrained,
    seasonsSkipped,
    train: trainLog,
    predictions,
    notes,
  };
}

/** Resolve repo root when invoked from nested cwd. */
export function nightRefreshRepoRoot(): string {
  return path.resolve(process.cwd());
}
