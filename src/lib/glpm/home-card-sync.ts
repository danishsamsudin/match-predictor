/**
 * Keep homepage upcoming cards aligned with Predict (GLPM-CX).
 *
 * 1) Force-write CX snapshots for open home-league fixtures
 * 2) Rebuild glpm_home_hub_snapshot packs from those rows
 * 3) Verify pack markets match the latest CX history row
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { tryCreateServiceClient } from "@/lib/supabase";
import {
  refreshGlpmHomeHubPacks,
  type RefreshGlpmHomeHubPacksResult,
} from "@/lib/glpm/home-hub-refresh";
import { loadGlpmHomeHubSnapshot } from "@/lib/glpm/home-hub-snapshot";
import type { GlpmHubUpcomingMatch } from "@/lib/glpm/hub-types";
import {
  GLPM_HOME_LEAGUE_NAMES,
  runGlpmUpcomingPredictionSnapshots,
  type UpcomingPredictionSnapshotResult,
} from "@/lib/glpm/run-upcoming-prediction-snapshots";
import { loadGlpmHubCatalog } from "@/lib/glpm/hub-catalog";
import { pickFixtureSeasonId } from "@/lib/glpm/season-ready";

type Client = SupabaseClient<Database>;

const PROB_EPS = 0.0005;
const XG_EPS = 0.005;

export type HomeCardSyncMismatch = {
  competition: string;
  matchSmId: number;
  homeName: string;
  awayName: string;
  reason: "missing_prediction" | "stale_vs_cx" | "missing_cx_row";
  detail?: string;
};

export type HomeCardSyncVerifyResult = {
  checked: number;
  matched: number;
  mismatches: HomeCardSyncMismatch[];
};

export type HomeCardSyncResult = {
  ok: boolean;
  predictions: UpcomingPredictionSnapshotResult;
  homeHubPacks: RefreshGlpmHomeHubPacksResult;
  verify: HomeCardSyncVerifyResult;
  errors: string[];
};

function nearlyEqual(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

/** Returns null when markets match; otherwise a short diff string. */
export function predictionMatchesCx(
  card: NonNullable<GlpmHubUpcomingMatch["prediction"]>,
  cx: {
    home_win_pct: number | string;
    draw_pct: number | string;
    away_win_pct: number | string;
    home_xg: number | string;
    away_xg: number | string;
    btts_yes_pct?: number | string | null;
    over_under?: unknown;
  }
): string | null {
  const over25 =
    cx.over_under &&
    typeof cx.over_under === "object" &&
    typeof (cx.over_under as Record<string, { over?: number }>)["2.5"]?.over ===
      "number"
      ? (cx.over_under as Record<string, { over: number }>)["2.5"].over
      : null;

  const checks: Array<[string, number, number, number]> = [
    ["homeWin", card.homeWin, Number(cx.home_win_pct), PROB_EPS],
    ["draw", card.draw, Number(cx.draw_pct), PROB_EPS],
    ["awayWin", card.awayWin, Number(cx.away_win_pct), PROB_EPS],
    ["homeXg", card.homeXg, Number(cx.home_xg), XG_EPS],
    ["awayXg", card.awayXg, Number(cx.away_xg), XG_EPS],
  ];
  if (cx.btts_yes_pct != null) {
    checks.push(["bttsYes", card.bttsYes, Number(cx.btts_yes_pct), PROB_EPS]);
  }
  if (over25 != null) {
    checks.push(["over25", card.over25, over25, PROB_EPS]);
  }

  const failed = checks
    .filter(([, a, b, eps]) => !nearlyEqual(a, b, eps))
    .map(([name, a, b]) => `${name} card=${a} cx=${b}`);
  return failed.length ? failed.join("; ") : null;
}

/**
 * Compare frozen home hub fixture packs against latest CX history rows.
 */
export async function verifyGlpmHomeCardsAgainstCx(
  client: Client
): Promise<HomeCardSyncVerifyResult> {
  const catalog = await loadGlpmHubCatalog(client);
  const mismatches: HomeCardSyncMismatch[] = [];
  let checked = 0;
  let matched = 0;

  for (const leagueName of GLPM_HOME_LEAGUE_NAMES) {
    const competition = catalog.competitionList.find(
      (item) => item.name.toLowerCase() === leagueName.toLowerCase()
    );
    if (!competition) continue;

    const fixtureSeasonId = pickFixtureSeasonId(
      catalog.seasonList,
      catalog.readiness,
      competition.smId
    );
    if (fixtureSeasonId == null) continue;

    const snap = await loadGlpmHomeHubSnapshot(client, {
      competitionSmId: competition.smId,
      seasonSmId: fixtureSeasonId,
      kind: "fixtures",
    });
    const upcoming = snap?.payload?.upcoming ?? [];
    if (!upcoming.length) continue;

    const matchIds = upcoming.map((m) => m.matchSmId).filter(Number.isFinite);
    const { data: cxRows } = await client
      .from("glpm_cx_prediction_history")
      .select(
        "match_sm_id,home_win_pct,draw_pct,away_win_pct,home_xg,away_xg,btts_yes_pct,over_under,executed_at"
      )
      .in("match_sm_id", matchIds)
      .order("executed_at", { ascending: false });

    const latestCx = new Map<
      number,
      NonNullable<typeof cxRows>[number]
    >();
    for (const row of cxRows ?? []) {
      const id = Number(row.match_sm_id);
      if (!Number.isFinite(id) || latestCx.has(id)) continue;
      latestCx.set(id, row);
    }

    for (const match of upcoming) {
      checked += 1;
      const cx = latestCx.get(match.matchSmId);
      if (!match.prediction) {
        mismatches.push({
          competition: leagueName,
          matchSmId: match.matchSmId,
          homeName: match.homeName,
          awayName: match.awayName,
          reason: cx ? "missing_prediction" : "missing_cx_row",
          detail: cx
            ? "Hub pack has no prediction but CX history exists"
            : "No CX history row for open fixture",
        });
        continue;
      }
      if (!cx) {
        mismatches.push({
          competition: leagueName,
          matchSmId: match.matchSmId,
          homeName: match.homeName,
          awayName: match.awayName,
          reason: "missing_cx_row",
          detail: "Hub pack has a prediction but no CX history row",
        });
        continue;
      }
      const detail = predictionMatchesCx(match.prediction, cx);
      if (detail) {
        mismatches.push({
          competition: leagueName,
          matchSmId: match.matchSmId,
          homeName: match.homeName,
          awayName: match.awayName,
          reason: "stale_vs_cx",
          detail,
        });
        continue;
      }
      matched += 1;
    }
  }

  return { checked, matched, mismatches };
}

/**
 * Force-refresh CX snapshots for home cards, rebuild hub packs, then verify.
 * Intended for off-peak cron / GitHub Actions (not request path).
 */
export async function runGlpmHomeCardSync(options?: {
  client?: Client;
  competitionNames?: readonly string[];
  maxPerCompetition?: number;
  /** Default true - rewrite CX even when a same-day row already exists. */
  force?: boolean;
  skipPredict?: boolean;
  skipHubRefresh?: boolean;
  skipVerify?: boolean;
}): Promise<HomeCardSyncResult> {
  const client = options?.client ?? tryCreateServiceClient();
  const errors: string[] = [];
  if (!client) {
    const emptyPred: UpcomingPredictionSnapshotResult = {
      ok: false,
      fixturesAttempted: 0,
      predictionsWritten: 0,
      skippedFresh: 0,
      skippedNoVectors: 0,
      errors: ["Supabase service client unavailable"],
      byCompetition: [],
    };
    return {
      ok: false,
      predictions: emptyPred,
      homeHubPacks: {
        ok: false,
        packsWritten: 0,
        errors: ["Supabase service client unavailable"],
        byLeague: [],
      },
      verify: { checked: 0, matched: 0, mismatches: [] },
      errors: ["Supabase service client unavailable"],
    };
  }

  const force = options?.force !== false;
  const maxPerCompetition = options?.maxPerCompetition ?? 48;
  const competitionNames = options?.competitionNames ?? GLPM_HOME_LEAGUE_NAMES;

  let predictions: UpcomingPredictionSnapshotResult;
  if (options?.skipPredict) {
    predictions = {
      ok: true,
      fixturesAttempted: 0,
      predictionsWritten: 0,
      skippedFresh: 0,
      skippedNoVectors: 0,
      errors: [],
      byCompetition: [],
    };
  } else {
    predictions = await runGlpmUpcomingPredictionSnapshots({
      client,
      competitionNames,
      maxPerCompetition,
      force,
    });
    errors.push(...predictions.errors);
  }

  let homeHubPacks: RefreshGlpmHomeHubPacksResult;
  if (options?.skipHubRefresh) {
    homeHubPacks = {
      ok: true,
      packsWritten: 0,
      errors: [],
      byLeague: [],
    };
  } else {
    homeHubPacks = await refreshGlpmHomeHubPacks({
      client,
      competitionNames,
      upcomingLimit: maxPerCompetition,
      includeWeather: true,
    });
    errors.push(...homeHubPacks.errors);
  }

  let verify: HomeCardSyncVerifyResult;
  if (options?.skipVerify) {
    verify = { checked: 0, matched: 0, mismatches: [] };
  } else {
    verify = await verifyGlpmHomeCardsAgainstCx(client);
    if (verify.mismatches.length) {
      errors.push(
        `verify: ${verify.mismatches.length}/${verify.checked} card(s) out of sync with latest CX`
      );
    }
  }

  return {
    ok: predictions.ok && homeHubPacks.ok && verify.mismatches.length === 0,
    predictions,
    homeHubPacks,
    verify,
    errors,
  };
}
