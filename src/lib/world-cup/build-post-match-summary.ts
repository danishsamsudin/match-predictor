import path from "node:path";
import { alignFinishedMatchForDisplay } from "@/lib/world-cup/align-finished-match-for-display";
import {
  avgBrier1x2ForSnapshots,
  avgCompositeLossForSnapshots,
} from "@/lib/world-cup/graham-snapshot-calibration";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { ML_WALK_FORWARD_HOLDOUT } from "@/lib/world-cup/ml-guardrails";
import {
  formatPredictedScoreline,
  orientHubPredictionToMatch,
} from "@/lib/world-cup/orient-hub-prediction-to-match";
import {
  buildImplicationsParagraph,
  diffCalibrationConstants,
  explainParamChange,
  type ParamChange,
} from "@/lib/world-cup/post-match-param-explanations";
import type { PostMatchRunManifest } from "@/lib/world-cup/post-match-run-manifest";
import {
  loadWcCalibrationConfig,
  type WcCalibrationConstants,
} from "@/lib/world-cup/wc-calibration-config";
import { recomputeXgFromSnapshot } from "@/lib/world-cup/graham-snapshot-calibration";
import { ingestSourceForMatch, loadIngestSourceByMatchId } from "@/lib/world-cup/load-ingest-source-by-match";
import { scoreLockedPrediction } from "@/lib/world-cup/wc-prediction-eval";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MatchLabel {
  id: string;
  label: string;
  date: string;
  homeGoals: number;
  awayGoals: number;
}

interface HoldoutRow {
  matchId: string;
  label: string;
  date: string;
  actualHome: number;
  actualAway: number;
  predictedHome: number;
  predictedAway: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  compositeLoss: number;
  brier1x2: number;
  correct1x2: boolean;
  favoredOutcome: string;
  actualOutcome: string;
}

function formatPct(n: number): string {
  const p = n > 1 ? n : n * 100;
  return `${p.toFixed(0)}%`;
}

function probFraction(n: number): number {
  return n > 1 ? n / 100 : n;
}

function outcomeFromScore(h: number, a: number): string {
  if (h > a) return "home win";
  if (h < a) return "away win";
  return "draw";
}

function favoredOutcome(home: number, draw: number, away: number): string {
  const max = Math.max(home, draw, away);
  if (max === home) return "home win";
  if (max === away) return "away win";
  return "draw";
}

async function loadTeamNames(
  supabase: SupabaseClient,
  teamIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(teamIds.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("teams").select("id, name").in("id", unique);
  return new Map((data ?? []).map((t) => [String(t.id), String(t.name)]));
}

function matchLabel(
  m: { id: string; home_team_id: string | null; away_team_id: string | null; date: string; home_goals: number; away_goals: number },
  names: Map<string, string>
): MatchLabel {
  const home = m.home_team_id ? names.get(String(m.home_team_id)) ?? "Home" : "Home";
  const away = m.away_team_id ? names.get(String(m.away_team_id)) ?? "Away" : "Away";
  return {
    id: String(m.id),
    label: `${home} vs ${away}`,
    date: m.date,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
  };
}

async function sectionCollected(
  supabase: SupabaseClient,
  manifest: PostMatchRunManifest
): Promise<string[]> {
  const lines: string[] = ["## What we collected", ""];

  if (!manifest.pipelineRun) {
    lines.push(
      "_Run `npm run wc:postmatch` for a full pipeline snapshot. Showing model performance and calibration state only._",
      ""
    );
    return lines;
  }

  lines.push(
    `Pipeline started at **${manifest.startedAt}** with **${manifest.articleFiles.length}** Opta article(s) and **${manifest.playerStatsFixtureCount}** player-stats fixture folder(s) on disk.`
  );
  lines.push("");

  const { data: articleIngests } = await supabase
    .from("world_cup_post_match_ingests")
    .select("match_id, source_path, parsed, ingested_at")
    .gte("ingested_at", manifest.startedAt)
    .order("ingested_at", { ascending: true });

  if (articleIngests?.length) {
    lines.push("### Opta articles (match results & team xG)");
    const matchIds = articleIngests.map((r) => String(r.match_id));
    const { data: matches } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, date, home_goals, away_goals")
      .in("id", matchIds);
    const names = await loadTeamNames(
      supabase,
      (matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
    );
    const matchById = new Map((matches ?? []).map((m) => [String(m.id), m]));

    for (const row of articleIngests) {
      const m = matchById.get(String(row.match_id));
      const parsed = (row.parsed as Record<string, unknown> | null) ?? {};
      const homeXg = parsed.homeXg ?? parsed.home_xg;
      const awayXg = parsed.awayXg ?? parsed.away_xg;
      const file = row.source_path ? path.basename(String(row.source_path)) : "article";
      if (m) {
        const lbl = matchLabel(
          {
            id: String(m.id),
            home_team_id: m.home_team_id,
            away_team_id: m.away_team_id,
            date: m.date,
            home_goals: m.home_goals ?? 0,
            away_goals: m.away_goals ?? 0,
          },
          names
        );
        lines.push(
          `- **${lbl.label}** — final **${lbl.homeGoals}-${lbl.awayGoals}**, xG **${homeXg ?? "?"}-${awayXg ?? "?"}** (${file})`
        );
      } else {
        lines.push(`- Match \`${row.match_id}\` from ${file}`);
      }
    }
    lines.push("");
  } else {
    lines.push(
      "- No new article ingests this run (files may have been skipped as already ingested)."
    );
    lines.push("");
  }

  const { data: playerIngests } = await supabase
    .from("world_cup_player_stats_ingests")
    .select("match_id, parsed_summary, warnings, ingested_at")
    .gte("ingested_at", manifest.startedAt)
    .order("ingested_at", { ascending: true });

  if (playerIngests?.length) {
    lines.push("### Player stats (lineups, per-player xG, composites)");
    for (const row of playerIngests) {
      const summary = (row.parsed_summary as Record<string, unknown> | null) ?? {};
      const home = summary.homeTeamName ?? "?";
      const away = summary.awayTeamName ?? "?";
      const players = summary.playerCount ?? "?";
      const drift = summary.xgDrift;
      const warn = (row.warnings as string[] | null) ?? [];
      let line = `- **${home} vs ${away}** — ${players} players logged`;
      if (typeof drift === "number") line += `, player-xG drift ${Number(drift).toFixed(2)}`;
      if (warn.length) line += ` _(warnings: ${warn.join("; ")})_`;
      lines.push(line);
    }
    lines.push("");
  } else {
    lines.push(
      "- No new player-stats ingests this run (fixtures may have been skipped as already ingested)."
    );
    lines.push("");
  }

  lines.push(
    "### Also refreshed automatically",
    "- Tournament player/team form composites",
    "- National xG-Elo / WCTR ratings",
    "- StatsBomb process metrics (when import data is available)",
    "- ML training examples and walk-forward model check",
    "- Hub predictions and tournament forecast",
    ""
  );

  return lines;
}

function sectionChanges(
  manifest: PostMatchRunManifest,
  calibrationAfter: WcCalibrationConstants,
  newCalibrationRows: Array<{ version: string; metrics: Record<string, unknown> }>
): string[] {
  const lines: string[] = ["## What changed", ""];

  const before = manifest.calibrationBefore.constants;
  const after = calibrationAfter;
  const versionBefore = manifest.calibrationBefore.version;
  const versionAfter = calibrationAfter.modelVersion;

  lines.push(
    `- **Model version:** \`${versionBefore}\` → \`${versionAfter}\`${versionBefore === versionAfter ? " _(unchanged)_" : ""}`
  );
  lines.push(
    `- **Finished matches in DB:** ${manifest.finishedMatchCountBefore} at start → ratings and form now include any matches ingested this run.`
  );
  lines.push("");

  const paramChanges = diffCalibrationConstants(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>
  );

  if (newCalibrationRows.length) {
    lines.push("### New calibration records saved this run");
    for (const row of newCalibrationRows) {
      const m = row.metrics;
      const parts: string[] = [`\`${row.version}\``];
      if (typeof m.baseline_composite === "number" && typeof m.candidate_composite === "number") {
        parts.push(
          `train composite ${Number(m.baseline_composite).toFixed(4)} → ${Number(m.candidate_composite).toFixed(4)}`
        );
      }
      if (typeof m.candidate_blend_score === "number" && typeof m.baseline_composite === "number") {
        parts.push(`blend score → ${Number(m.candidate_blend_score).toFixed(4)}`);
      }
      if (typeof m.holdout_composite === "number" && typeof m.holdout_baseline_composite === "number") {
        parts.push(
          `holdout ${Number(m.holdout_baseline_composite).toFixed(4)} → ${Number(m.holdout_composite).toFixed(4)}`
        );
      }
      if (typeof m.candidate_loss === "number" && typeof m.baseline_loss === "number") {
        parts.push(
          `holdout loss ${Number(m.baseline_loss).toFixed(4)} → ${Number(m.candidate_loss).toFixed(4)}`
        );
      }
      if (typeof m.evaluation_count === "number") {
        parts.push(`${m.evaluation_count} matches in grid search`);
      }
      lines.push(`- ${parts.join(" | ")}`);
    }
    lines.push("");
  }

  if (paramChanges.length) {
    lines.push("### Constant adjustments (deployed model)");
    for (const c of paramChanges) {
      const sign = c.deltaPct >= 0 ? "+" : "";
      lines.push(
        `- \`${c.key}\`: ${c.before.toFixed(4)} → ${c.after.toFixed(4)} (${sign}${(c.deltaPct * 100).toFixed(1)}%)`
      );
    }
    lines.push("");
  } else if (versionBefore === versionAfter) {
    lines.push(
      "_No calibration constants moved enough to report (>0.2% relative change). Graham grid search and ML walk-forward either found no improvement or did not deploy._",
      ""
    );
  }

  return lines;
}

function sectionMeanings(changes: ParamChange[]): string[] {
  const lines: string[] = ["## What the changes mean", ""];
  if (!changes.length) {
    lines.push(
      "The model weights stayed on the current calibration. New match data still updates team ratings, player form, and lineup projections — only the tuning knobs are unchanged.",
      ""
    );
    return lines;
  }
  for (const c of changes) {
    lines.push(`- ${explainParamChange(c)}`);
  }
  lines.push("");
  return lines;
}

function sectionImplications(changes: ParamChange[]): string[] {
  return ["## Implications for upcoming predictions", "", buildImplicationsParagraph(changes), ""];
}

async function loadHoldoutRows(
  supabase: SupabaseClient,
  limit: number
): Promise<
  Array<{
    match: MatchLabel;
    snapshot: Record<string, unknown>;
    actualHome: number;
    actualAway: number;
    predictedHome: number;
    predictedAway: number;
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    compositeLoss: number;
    brier1x2: number;
  }>
> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, date, home_goals, away_goals, status")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup")
    .order("date", { ascending: true });

  const finished = (matches ?? []).filter(
    (m) => m.home_goals != null && m.away_goals != null
  );
  const recent = finished.slice(-limit);
  if (!recent.length) return [];

  const ingestByMatch = await loadIngestSourceByMatchId(
    supabase,
    recent.map((m) => String(m.id))
  );

  const matchIds = recent.map((m) => String(m.id));
  const { data: preds } = await supabase
    .from("world_cup_predictions")
    .select(
      "match_id, predicted_score_home, predicted_score_away, home_win_pct, draw_pct, away_win_pct, under_2_5_pct, over_2_5_pct, model_version, snapshot"
    )
    .in("match_id", matchIds);

  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));
  const names = await loadTeamNames(
    supabase,
    recent.flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
  );

  const rows: Array<{
    match: MatchLabel;
    snapshot: Record<string, unknown>;
    actualHome: number;
    actualAway: number;
    predictedHome: number;
    predictedAway: number;
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    compositeLoss: number;
    brier1x2: number;
  }> = [];

  for (const m of recent) {
    const predRow = predByMatch.get(String(m.id));
    if (!predRow?.snapshot) continue;

    const ingest = ingestSourceForMatch(ingestByMatch, String(m.id));
    const display = alignFinishedMatchForDisplay(
      {
        id: String(m.id),
        date: m.date,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_goals: m.home_goals!,
        away_goals: m.away_goals!,
        ...ingest,
      },
      names
    );
    if (!display) continue;

    const rawPred: HubPredictionRow = {
      home_win_pct: Number(predRow.home_win_pct),
      draw_pct: Number(predRow.draw_pct),
      away_win_pct: Number(predRow.away_win_pct),
      predicted_score_home: Number(predRow.predicted_score_home),
      predicted_score_away: Number(predRow.predicted_score_away),
      under_2_5_pct: Number(predRow.under_2_5_pct ?? 0),
      over_2_5_pct: Number(predRow.over_2_5_pct ?? 0),
      model_version: String(predRow.model_version ?? ""),
      snapshot: predRow.snapshot as Record<string, unknown>,
    };
    const oriented = orientHubPredictionToMatch(
      rawPred,
      display.homeTeamId,
      display.awayTeamId,
      display.homeTeamName,
      display.awayTeamName
    );
    const scores = scoreLockedPrediction(
      oriented,
      display.homeGoals,
      display.awayGoals
    );

    rows.push({
      match: {
        id: String(m.id),
        label: display.label,
        date: m.date,
        homeGoals: display.homeGoals,
        awayGoals: display.awayGoals,
      },
      snapshot: oriented.snapshot,
      actualHome: display.homeGoals,
      actualAway: display.awayGoals,
      predictedHome: oriented.predicted_score_home,
      predictedAway: oriented.predicted_score_away,
      homeWinPct: probFraction(oriented.home_win_pct),
      drawPct: probFraction(oriented.draw_pct),
      awayWinPct: probFraction(oriented.away_win_pct),
      compositeLoss: scores.compositeLoss,
      brier1x2: scores.brier1x2,
    });
  }

  return rows;
}

function toHoldoutDisplay(row: {
  match: MatchLabel;
  actualHome: number;
  actualAway: number;
  predictedHome: number;
  predictedAway: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  compositeLoss: number;
  brier1x2: number;
}): HoldoutRow {
  const favored = favoredOutcome(row.homeWinPct, row.drawPct, row.awayWinPct);
  const actual = outcomeFromScore(row.actualHome, row.actualAway);
  return {
    matchId: row.match.id,
    label: row.match.label,
    date: row.match.date,
    actualHome: row.actualHome,
    actualAway: row.actualAway,
    predictedHome: row.predictedHome,
    predictedAway: row.predictedAway,
    homeWinPct: row.homeWinPct,
    drawPct: row.drawPct,
    awayWinPct: row.awayWinPct,
    compositeLoss: row.compositeLoss,
    brier1x2: row.brier1x2,
    correct1x2: favored === actual,
    favoredOutcome: favored,
    actualOutcome: actual,
  };
}

async function sectionModelPerformance(
  supabase: SupabaseClient,
  manifest: PostMatchRunManifest,
  calibrationAfter: WcCalibrationConstants
): Promise<string[]> {
  const holdoutN = ML_WALK_FORWARD_HOLDOUT;
  const lines: string[] = [
    `## Model performance (last ${holdoutN} finished matches)`,
    "",
    `_We test on the most recent ${holdoutN} World Cup matches with locked pre-kickoff predictions. Lower **composite loss** and **Brier 1X2** are better. **1X2 hit** means the highest-probability outcome matched the result._`,
    "",
  ];

  const holdoutData = await loadHoldoutRows(supabase, holdoutN);
  if (!holdoutData.length) {
    lines.push("_Not enough finished matches with locked predictions yet._", "");
    return lines;
  }

  const published = holdoutData.map(toHoldoutDisplay);
  const hits = published.filter((r) => r.correct1x2).length;
  const avgComposite =
    published.reduce((s, r) => s + (Number.isFinite(r.compositeLoss) ? r.compositeLoss : 0), 0) /
    published.length;
  const avgBrier =
    published.reduce((s, r) => s + (Number.isFinite(r.brier1x2) ? r.brier1x2 : 0), 0) /
    published.length;

  lines.push("### Published predictions (what the hub showed before kickoff)");
  lines.push(
    `- **1X2 accuracy:** ${hits}/${published.length} (${formatPct(hits / published.length)})`
  );
  lines.push(`- **Average composite loss:** ${avgComposite.toFixed(4)}`);
  lines.push(`- **Average Brier 1X2:** ${avgBrier.toFixed(4)}`);
  lines.push("");

  for (const r of published) {
    const pick = `${formatPct(r.homeWinPct)} / ${formatPct(r.drawPct)} / ${formatPct(r.awayWinPct)}`;
    const mark = r.correct1x2 ? "[hit]" : "[miss]";
    lines.push(
      `- ${mark} **${r.label}** (${r.date}) — actual **${r.actualHome}-${r.actualAway}**, predicted **${formatPredictedScoreline(r.predictedHome, r.predictedAway)}**, 1X2 ${pick} (favoured ${r.favoredOutcome}) | composite ${Number.isFinite(r.compositeLoss) ? r.compositeLoss.toFixed(3) : "—"}`
    );
  }
  lines.push("");

  const evalRows = holdoutData.map((r) => ({
    snapshot: r.snapshot,
    actualHome: r.actualHome,
    actualAway: r.actualAway,
  }));

  const before = manifest.calibrationBefore.constants;
  const beforeComposite = avgCompositeLossForSnapshots(
    evalRows,
    before,
    before.modelVersion
  );
  const afterComposite = avgCompositeLossForSnapshots(
    evalRows,
    calibrationAfter,
    calibrationAfter.modelVersion
  );
  const beforeBrier = avgBrier1x2ForSnapshots(evalRows, before, before.modelVersion);
  const afterBrier = avgBrier1x2ForSnapshots(evalRows, calibrationAfter, calibrationAfter.modelVersion);

  const compositeDelta = afterComposite - beforeComposite;
  const brierDelta = afterBrier - beforeBrier;
  const improved =
    compositeDelta < -1e-6 || (Math.abs(compositeDelta) < 1e-6 && brierDelta < -1e-6);

  lines.push(
    `### Recalibrated backtest (same ${holdoutN} matches, new constants applied to locked snapshots)`
  );
  lines.push(
    `- **Composite loss:** ${beforeComposite.toFixed(4)} → ${afterComposite.toFixed(4)} (${compositeDelta >= 0 ? "+" : ""}${compositeDelta.toFixed(4)})`
  );
  lines.push(
    `- **Brier 1X2:** ${beforeBrier.toFixed(4)} → ${afterBrier.toFixed(4)} (${brierDelta >= 0 ? "+" : ""}${brierDelta.toFixed(4)})`
  );
  lines.push(
    improved
      ? `- **Verdict:** The updated calibration would have scored **better** on this holdout window.`
      : compositeDelta > 1e-6
        ? `- **Verdict:** The updated calibration is **worse** on this holdout — changes may be driven by the full-season grid, not just these ${holdoutN} games.`
        : `- **Verdict:** Holdout metrics are **roughly unchanged**; any deploy is a small incremental nudge.`
  );
  lines.push("");

  return lines;
}

async function sectionTonightMatches(
  supabase: SupabaseClient,
  manifest: PostMatchRunManifest
): Promise<string[]> {
  const { data: ingests } = await supabase
    .from("world_cup_post_match_ingests")
    .select("match_id")
    .gte("ingested_at", manifest.startedAt);

  const matchIds = [...new Set((ingests ?? []).map((r) => String(r.match_id)))];
  if (!matchIds.length) return [];

  const { data: evals } = await supabase
    .from("world_cup_prediction_evaluations")
    .select("match_id, market_scores, actual_score_home, actual_score_away")
    .in("match_id", matchIds);

  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, date, home_goals, away_goals")
    .in("id", matchIds);

  const ingestByMatch = await loadIngestSourceByMatchId(supabase, matchIds);

  const names = await loadTeamNames(
    supabase,
    (matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
  );
  const matchById = new Map((matches ?? []).map((m) => [String(m.id), m]));

  const { data: preds } = await supabase
    .from("world_cup_predictions")
    .select(
      "match_id, predicted_score_home, predicted_score_away, home_win_pct, draw_pct, away_win_pct, under_2_5_pct, over_2_5_pct, model_version, snapshot"
    )
    .in("match_id", matchIds);
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  const lines: string[] = ["## This run's match(es) — prediction post-mortem", ""];

  for (const ev of evals ?? []) {
    const m = matchById.get(String(ev.match_id));
    const predRow = predByMatch.get(String(ev.match_id));
    if (!m || !predRow) continue;

    const ingest = ingestSourceForMatch(ingestByMatch, String(m.id));
    const display = alignFinishedMatchForDisplay(
      {
        id: String(m.id),
        date: m.date,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_goals: m.home_goals ?? ev.actual_score_home,
        away_goals: m.away_goals ?? ev.actual_score_away,
        ...ingest,
      },
      names
    );
    if (!display) continue;

    const rawPred: HubPredictionRow = {
      home_win_pct: Number(predRow.home_win_pct),
      draw_pct: Number(predRow.draw_pct),
      away_win_pct: Number(predRow.away_win_pct),
      predicted_score_home: Number(predRow.predicted_score_home),
      predicted_score_away: Number(predRow.predicted_score_away),
      under_2_5_pct: Number(predRow.under_2_5_pct ?? 0),
      over_2_5_pct: Number(predRow.over_2_5_pct ?? 0),
      model_version: String(predRow.model_version ?? ""),
      snapshot: (predRow.snapshot as Record<string, unknown>) ?? {},
    };
    const oriented = orientHubPredictionToMatch(
      rawPred,
      display.homeTeamId,
      display.awayTeamId,
      display.homeTeamName,
      display.awayTeamName
    );
    const scores = scoreLockedPrediction(
      oriented,
      display.homeGoals,
      display.awayGoals
    );
    const favored = favoredOutcome(
      probFraction(oriented.home_win_pct),
      probFraction(oriented.draw_pct),
      probFraction(oriented.away_win_pct)
    );
    const actual = outcomeFromScore(display.homeGoals, display.awayGoals);
    const hit = favored === actual;

    lines.push(`### ${display.label}`);
    lines.push(
      `- **Result:** ${display.homeGoals}-${display.awayGoals} | **We predicted:** ${formatPredictedScoreline(oriented.predicted_score_home, oriented.predicted_score_away)}`
    );
    lines.push(
      `- **1X2:** favoured ${favored} (${formatPct(oriented.home_win_pct)} / ${formatPct(oriented.draw_pct)} / ${formatPct(oriented.away_win_pct)}) — ${hit ? "**correct**" : `**miss** (was ${actual})`}`
    );
    lines.push(`- **Composite loss:** ${scores.compositeLoss.toFixed(4)}`);
    const segments = (ev.market_scores as Record<string, unknown> | null)?.segments as
      | Record<string, boolean>
      | undefined;
    if (segments) {
      const tags = [
        segments.is_low_block ? "low-block game" : null,
        segments.is_high_rotation ? "heavy rotation" : null,
        segments.is_host_nation_home ? "host nation at home" : null,
      ].filter(Boolean);
      if (tags.length) lines.push(`- **Context tags:** ${tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines;
}

async function sectionMonitoring(
  supabase: SupabaseClient,
  manifest: PostMatchRunManifest
): Promise<string[]> {
  const holdoutData = await loadHoldoutRows(supabase, ML_WALK_FORWARD_HOLDOUT);
  if (!holdoutData.length) return [];

  const segments: Record<string, { n: number; hits: number; composite: number; brier: number }> =
    {};

  for (const row of holdoutData) {
    const evalRow = await supabase
      .from("world_cup_prediction_evaluations")
      .select("market_scores")
      .eq("match_id", row.match.id)
      .maybeSingle();
    const seg = (
      (evalRow.data?.market_scores as Record<string, unknown> | null)?.segments as
        | Record<string, boolean>
        | undefined
    ) ?? {};

    const keys = [
      seg.is_matchday_3 ? "MD3" : null,
      seg.is_high_rotation ? "rotation" : null,
      seg.is_low_block ? "low-block" : null,
      seg.is_high_altitude ? "altitude" : null,
      "all",
    ].filter(Boolean) as string[];

    for (const key of keys) {
      if (!segments[key]) segments[key] = { n: 0, hits: 0, composite: 0, brier: 0 };
      const bucket = segments[key]!;
      bucket.n += 1;
      bucket.composite += row.compositeLoss;
      bucket.brier += row.brier1x2;
      const favored = favoredOutcome(row.homeWinPct, row.drawPct, row.awayWinPct);
      const actual = outcomeFromScore(row.actualHome, row.actualAway);
      if (favored === actual) bucket.hits += 1;
    }
  }

  const lines: string[] = ["## Segment performance (holdout)", ""];
  for (const [key, stats] of Object.entries(segments).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === "all") continue;
    lines.push(
      `- **${key}:** ${stats.hits}/${stats.n} 1X2 | avg composite ${(stats.composite / stats.n).toFixed(4)} | avg Brier ${(stats.brier / stats.n).toFixed(4)}`
    );
  }
  const all = segments.all;
  if (all) {
    lines.push(
      `- **all holdout:** ${all.hits}/${all.n} 1X2 | avg composite ${(all.composite / all.n).toFixed(4)}`
    );
  }
  lines.push("");

  const calibrationAfter = await loadWcCalibrationConfig();
  const orientationFlags: string[] = [];
  for (const row of holdoutData) {
    const { homeXg, awayXg } = recomputeXgFromSnapshot(
      row.snapshot,
      calibrationAfter
    );
    const storedHome = Number(row.snapshot.home_xg ?? row.snapshot.lambda ?? 0);
    const storedAway = Number(row.snapshot.away_xg ?? row.snapshot.mu ?? 0);
    const drift = Math.max(Math.abs(homeXg - storedHome), Math.abs(awayXg - storedAway));
    if (drift > 0.05) {
      orientationFlags.push(
        `${row.match.label}: recompute drift ${drift.toFixed(3)} (stored ${storedHome.toFixed(2)}-${storedAway.toFixed(2)} vs ${homeXg.toFixed(2)}-${awayXg.toFixed(2)})`
      );
    }
  }

  lines.push("## Orientation / snapshot audit", "");
  if (!orientationFlags.length) {
    lines.push("_All holdout snapshots recompute within 0.05 xG of stored values._", "");
  } else {
    for (const flag of orientationFlags) {
      lines.push(`- ${flag}`);
    }
    lines.push("");
  }

  return lines;
}

export async function buildPostMatchSummary(
  supabase: SupabaseClient,
  manifest: PostMatchRunManifest
): Promise<string> {
  const calibrationAfter = await loadWcCalibrationConfig();

  const { data: newConfigs } = await supabase
    .from("world_cup_calibration_config")
    .select("version, metrics, created_at")
    .gte("created_at", manifest.startedAt)
    .order("created_at", { ascending: true });

  const paramChanges = diffCalibrationConstants(
    manifest.calibrationBefore.constants as unknown as Record<string, unknown>,
    calibrationAfter as unknown as Record<string, unknown>
  );

  const parts: string[] = [
    "# WC Post-Match Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "---",
    "",
    ...(await sectionCollected(supabase, manifest)),
    ...(sectionChanges(
      manifest,
      calibrationAfter,
      (newConfigs ?? []).map((r) => ({
        version: String(r.version),
        metrics: (r.metrics as Record<string, unknown>) ?? {},
      }))
    )),
    ...sectionMeanings(paramChanges),
    ...sectionImplications(paramChanges),
    ...(await sectionModelPerformance(supabase, manifest, calibrationAfter)),
    ...(await sectionMonitoring(supabase, manifest)),
    ...(await sectionTonightMatches(supabase, manifest)),
    "---",
    "",
    "## Quick reference",
    "",
    "- **Composite loss:** blended error across 1X2, scoreline, O/U 2.5, BTTS, and handicaps (lower is better).",
    "- **Brier 1X2:** probability calibration for home/draw/away (lower is better; ~0.67 is naive guessing).",
    `- **Holdout window:** last **${ML_WALK_FORWARD_HOLDOUT}** finished WC matches — same window ML training uses for walk-forward validation.`,
    "",
  ];

  return parts.join("\n");
}
