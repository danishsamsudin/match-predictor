"use client";

import Link from "next/link";
import type { SideInteractions } from "@/lib/glpm/engine";
import { buildGlpmCompareHref } from "@/lib/glpm/hub-prediction-map";
import {
  favoriteFromPrediction,
  settleScoreMarkets,
} from "@/lib/glpm/live-scores/settle-markets";
import type { LiveScoreMatch } from "@/lib/glpm/live-scores/types";

function pctLabel(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

function fmtNum(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

function sidePair(
  home: number | null | undefined,
  away: number | null | undefined,
  digits = 0
): string {
  if (
    (home == null || !Number.isFinite(home)) &&
    (away == null || !Number.isFinite(away))
  ) {
    return "-";
  }
  return `${fmtNum(home, digits)} - ${fmtNum(away, digits)}`;
}

function InteractionBar({
  label,
  homeDelta,
  awayDelta,
}: {
  label: string;
  homeDelta: number;
  awayDelta: number;
}) {
  const max = Math.max(Math.abs(homeDelta), Math.abs(awayDelta), 0.01);
  const homePct = (Math.abs(homeDelta) / max) * 50;
  const awayPct = (Math.abs(awayDelta) / max) * 50;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="tabular-nums text-primary">
          {homeDelta >= 0 ? "+" : ""}
          {homeDelta.toFixed(2)}
        </span>
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-accent">
          {awayDelta >= 0 ? "+" : ""}
          {awayDelta.toFixed(2)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="flex h-2 justify-end overflow-hidden rounded-l-full bg-slate-200/60 dark:bg-slate-800">
          <div
            className={`h-full rounded-l-full ${homeDelta >= 0 ? "bg-primary" : "bg-primary/40"}`}
            style={{ width: `${homePct}%` }}
          />
        </div>
        <div className="flex h-2 overflow-hidden rounded-r-full bg-slate-200/60 dark:bg-slate-800">
          <div
            className={`h-full rounded-r-full ${awayDelta >= 0 ? "bg-accent" : "bg-accent/40"}`}
            style={{ width: `${awayPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  predicted,
  actual,
  hit,
}: {
  label: string;
  predicted: string;
  actual: string;
  hit?: boolean | null;
}) {
  const hitClass =
    hit === true
      ? "text-emerald-700 dark:text-emerald-300"
      : hit === false
        ? "text-rose-700 dark:text-rose-300"
        : "text-foreground";
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-glass-border/60 py-2 last:border-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-right text-xs font-semibold tabular-nums text-foreground sm:text-sm">
        {predicted}
      </p>
      <p className={`text-right text-xs font-semibold tabular-nums sm:text-sm ${hitClass}`}>
        {actual}
      </p>
    </div>
  );
}

function sourceLabel(source: LiveScoreMatch["predictionSource"]): string | null {
  if (source === "cx") return "CX locked";
  if (source === "stored") return "Base locked";
  if (source === "live") return "Model";
  return null;
}

function resultLabel(result: "H" | "D" | "A"): string {
  if (result === "H") return "Home";
  if (result === "A") return "Away";
  return "Draw";
}

export function PredictedVsActualPanel({ match }: { match: LiveScoreMatch }) {
  const settled = settleScoreMarkets(match.homeScore, match.awayScore);
  const prediction = match.prediction ?? null;
  const home = match.actualHomeStats ?? null;
  const away = match.actualAwayStats ?? null;
  const predHome = match.predictedHomeStats ?? null;
  const predAway = match.predictedAwayStats ?? null;
  const interactions = match.interactions ?? null;
  const chip = sourceLabel(match.predictionSource ?? null);

  const favorite = prediction
    ? favoriteFromPrediction({
        homeWin: prediction.homeWin,
        draw: prediction.draw,
        awayWin: prediction.awayWin,
      })
    : null;
  const overHit = prediction ? prediction.over25 >= 0.5 === settled.over25 : null;
  const bttsHit = prediction ? prediction.bttsYes >= 0.5 === settled.btts : null;
  const resultHit = favorite != null ? favorite === settled.result : null;

  const cornersTotal =
    home?.corners != null && away?.corners != null
      ? home.corners + away.corners
      : null;

  const compareHref = buildGlpmCompareHref({
    homeTeamSmId: match.homeTeamSmId,
    awayTeamSmId: match.awayTeamSmId,
    matchSmId: match.matchSmId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Predicted vs actual
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            <span className="text-primary">{match.homeTeamName}</span>
            <span className="mx-1 text-muted">vs</span>
            <span className="text-accent">{match.awayTeamName}</span>
          </p>
        </div>
        {chip ? (
          <span className="rounded-full border border-glass-border bg-surface/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {chip}
          </span>
        ) : null}
      </div>

      {!prediction ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          No pre-match prediction locked for this fixture.
        </p>
      ) : match.predictionSource === "live" ? (
        <p className="text-[11px] text-muted">
          Locked snapshot was collapsed (near-equal sides). Showing reconstructed model markets from
          season-ready rating vectors.
        </p>
      ) : null}

      <section>
        <div className="mb-1 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[10px] font-bold uppercase tracking-wide text-muted">
          <span>Market</span>
          <span className="text-right">Predicted</span>
          <span className="text-right">Actual</span>
        </div>
        <div className="rounded-xl border border-glass-border bg-surface/60 px-3">
          <CompareRow
            label="1X2"
            predicted={
              prediction
                ? `${pctLabel(prediction.homeWin)} / ${pctLabel(prediction.draw)} / ${pctLabel(prediction.awayWin)}`
                : "-"
            }
            actual={`${resultLabel(settled.result)} · ${match.homeScore}-${match.awayScore}`}
            hit={resultHit}
          />
          <CompareRow
            label="xG"
            predicted={
              prediction
                ? `${prediction.homeXg.toFixed(2)} - ${prediction.awayXg.toFixed(2)}`
                : "-"
            }
            actual={sidePair(home?.xg, away?.xg, 2)}
          />
          <CompareRow
            label="Over 2.5"
            predicted={prediction ? pctLabel(prediction.over25) : "-"}
            actual={settled.over25 ? "Over" : "Under"}
            hit={overHit}
          />
          <CompareRow
            label="BTTS"
            predicted={prediction ? pctLabel(prediction.bttsYes) : "-"}
            actual={settled.btts ? "Yes" : "No"}
            hit={bttsHit}
          />
        </div>
      </section>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Match stats
        </p>
        <div className="rounded-xl border border-glass-border bg-surface/60 px-3">
          <CompareRow
            label="Corners"
            predicted={
              predHome || predAway
                ? `${sidePair(predHome?.corners, predAway?.corners, 1)}${
                    predHome?.corners != null && predAway?.corners != null
                      ? ` · tot ${fmtNum((predHome.corners ?? 0) + (predAway.corners ?? 0), 1)}`
                      : ""
                  }`
                : "-"
            }
            actual={
              cornersTotal != null
                ? `${sidePair(home?.corners, away?.corners)} · tot ${cornersTotal}`
                : sidePair(home?.corners, away?.corners)
            }
          />
          <CompareRow
            label="Yellow cards"
            predicted={sidePair(predHome?.yellowCards, predAway?.yellowCards, 1)}
            actual={sidePair(home?.yellowCards, away?.yellowCards)}
          />
          <CompareRow
            label="Red cards"
            predicted={sidePair(predHome?.redCards, predAway?.redCards, 1)}
            actual={sidePair(home?.redCards, away?.redCards)}
          />
          <CompareRow
            label="Shots"
            predicted={sidePair(predHome?.shots, predAway?.shots, 1)}
            actual={sidePair(home?.shots, away?.shots)}
          />
          <CompareRow
            label="Shots on target"
            predicted={sidePair(predHome?.shotsOnTarget, predAway?.shotsOnTarget, 1)}
            actual={sidePair(home?.shotsOnTarget, away?.shotsOnTarget)}
          />
          <CompareRow
            label="Possession %"
            predicted={sidePair(predHome?.possession, predAway?.possession, 0)}
            actual={sidePair(home?.possession, away?.possession)}
          />
        </div>
      </section>

      {interactions ? (
        <MatchupInteractionsBlock
          interactions={interactions}
          homePossession={home?.possession ?? null}
          awayPossession={away?.possession ?? null}
          homePpda={home?.ppda ?? null}
          awayPpda={away?.ppda ?? null}
        />
      ) : null}

      <Link
        href={compareHref}
        className="inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Open in predictor →
      </Link>
    </div>
  );
}

function MatchupInteractionsBlock({
  interactions,
  homePossession,
  awayPossession,
  homePpda,
  awayPpda,
}: {
  interactions: { home: SideInteractions; away: SideInteractions };
  homePossession: number | null;
  awayPossession: number | null;
  homePpda: number | null;
  awayPpda: number | null;
}) {
  const hasStyleOutcome =
    homePossession != null ||
    awayPossession != null ||
    homePpda != null ||
    awayPpda != null;

  return (
    <section>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
        Matchup interactions (Δ)
      </p>
      <p className="mb-2 text-[11px] text-muted">From team ratings used for this matchup.</p>
      <div className="space-y-3 rounded-xl border border-glass-border bg-surface/60 p-3">
        <InteractionBar
          label="Attack vs Defence"
          homeDelta={interactions.home.attack_defence}
          awayDelta={interactions.away.attack_defence}
        />
        <InteractionBar
          label="Finishing vs GK"
          homeDelta={interactions.home.finishing_goalkeeper}
          awayDelta={interactions.away.finishing_goalkeeper}
        />
        <InteractionBar
          label="Build-up vs Pressing"
          homeDelta={interactions.home.build_up_pressing}
          awayDelta={interactions.away.build_up_pressing}
        />
        <InteractionBar
          label="Possession vs Pressing"
          homeDelta={interactions.home.possession_pressing}
          awayDelta={interactions.away.possession_pressing}
        />
        {hasStyleOutcome ? (
          <div className="border-t border-glass-border/70 pt-2 text-[11px] text-muted">
            <p>
              Style outcome · Poss {sidePair(homePossession, awayPossession)} · PPDA{" "}
              {sidePair(homePpda, awayPpda, 1)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
