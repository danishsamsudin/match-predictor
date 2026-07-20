"use client";

import type { GlpmPredictUiPayload } from "@/lib/glpm/ui-types";
import { PRIMARY_LABELS, PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import { InfoTip } from "@/components/ui/InfoTip";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function ComparisonRow({
  label,
  homeValue,
  awayValue,
  info,
}: {
  label: string;
  homeValue: string;
  awayValue: string;
  info?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-white/20 py-2.5 last:border-0 dark:border-slate-800/50 sm:gap-x-4">
      <p className="min-w-0 truncate pr-2 text-right text-sm font-semibold tabular-nums text-primary">
        {homeValue}
      </p>
      <div className="flex w-[6.75rem] max-w-[38vw] shrink-0 flex-col items-center justify-center gap-1 px-1 text-center sm:w-[8.5rem]">
        <span className="w-full text-[10px] font-medium uppercase leading-snug tracking-wide text-muted sm:text-[11px]">
          {label}
        </span>
        {info ? (
          <InfoTip label={label} side="bottom">
            {info}
          </InfoTip>
        ) : null}
      </div>
      <p className="min-w-0 truncate pl-2 text-left text-sm font-semibold tabular-nums text-accent">
        {awayValue}
      </p>
    </div>
  );
}

function WinProbabilityBar({
  home,
  draw,
  away,
  homeLabel,
  awayLabel,
}: {
  home: number;
  draw: number;
  away: number;
  homeLabel: string;
  awayLabel: string;
}) {
  const h = Math.max(0, home) * 100;
  const d = Math.max(0, draw) * 100;
  const a = Math.max(0, away) * 100;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{homeLabel}</p>
          <p className="text-xl font-bold tabular-nums text-primary">{pct(home)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">Draw</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{pct(draw)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted">{awayLabel}</p>
          <p className="text-xl font-bold tabular-nums text-accent">{pct(away)}</p>
        </div>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
        <div className="bg-primary transition-all" style={{ width: `${h}%` }} />
        <div className="bg-slate-400/70 dark:bg-slate-500 transition-all" style={{ width: `${d}%` }} />
        <div className="bg-accent transition-all" style={{ width: `${a}%` }} />
      </div>
    </div>
  );
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
        <span className="tabular-nums text-primary">{homeDelta >= 0 ? "+" : ""}{homeDelta.toFixed(2)}</span>
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-accent">{awayDelta >= 0 ? "+" : ""}{awayDelta.toFixed(2)}</span>
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

function ScoreHeatmap({ matrix, homeLabel, awayLabel }: { matrix: number[][]; homeLabel: string; awayLabel: string }) {
  const flat = matrix.flat();
  const maxP = Math.max(...flat, 1e-9);
  const top: Array<{ h: number; a: number; p: number }> = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      top.push({ h, a, p: matrix[h][a] });
    }
  }
  top.sort((x, y) => y.p - x.p);
  const top5 = top.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="mx-auto border-collapse text-[10px] sm:text-xs">
          <thead>
            <tr>
              <th className="p-1 text-muted">{homeLabel.slice(0, 3)}\{awayLabel.slice(0, 3)}</th>
              {matrix[0]?.map((_, a) => (
                <th key={a} className="p-1 font-medium tabular-nums text-muted">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, h) => (
              <tr key={h}>
                <th className="p-1 font-medium tabular-nums text-muted">{h}</th>
                {row.map((p, a) => {
                  const intensity = p / maxP;
                  return (
                    <td
                      key={a}
                      className="p-0.5"
                      title={`${h}-${a}: ${pct(p)}`}
                    >
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-sm tabular-nums sm:h-8 sm:w-8"
                        style={{
                          backgroundColor: `color-mix(in srgb, var(--color-primary, #0ea5e9) ${Math.round(intensity * 85)}%, transparent)`,
                          color: intensity > 0.55 ? "white" : undefined,
                        }}
                      >
                        {(p * 100).toFixed(0)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {top5.map((s) => (
          <span
            key={`${s.h}-${s.a}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums dark:bg-slate-800"
          >
            {s.h}–{s.a} · {pct(s.p)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StylePills({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <span
          key={l}
          className="rounded-full border border-glass-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function trendArrow(trend?: string): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

export function GlpmPredictionResultCard({
  result,
}: {
  result: GlpmPredictUiPayload;
}) {
  const homeLabel = result.homeTeam.name;
  const awayLabel = result.awayTeam.name;

  return (
    <div className="liquid-glass-panel overflow-hidden rounded-2xl sm:rounded-[2rem]">
      <div className="border-b border-glass-border bg-gradient-to-r from-primary/10 via-transparent to-accent/10 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-foreground sm:text-xl">
            {homeLabel}{" "}
            <span className="font-normal text-muted">vs</span> {awayLabel}
          </h2>
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary-emphasis">
            GLPM clubs
          </span>
          <span className="rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-muted">
            {result.predModelVersion}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Vectors as of {result.homeTeam.asOfDate} / {result.awayTeam.asOfDate} · xG{" "}
          {result.xgModelVersion}
        </p>
      </div>

      <div className="min-w-0 space-y-8 p-4 sm:p-6">
        <WinProbabilityBar
          home={result.homeWin}
          draw={result.draw}
          away={result.awayWin}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-primary-emphasis">
              {homeLabel} xG
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
              {fmt(result.homeXg)}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-emphasis">
              {awayLabel} xG
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-accent">
              {fmt(result.awayXg)}
            </p>
          </div>
        </div>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Rating vector (0–100)
          </h3>
          <div className="liquid-glass-panel rounded-2xl px-3 py-1 sm:px-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-white/20 py-2 dark:border-slate-800/50">
              <p className="truncate pr-2 text-right text-xs font-semibold text-primary">
                {homeLabel}
              </p>
              <p className="w-[6.75rem] text-center text-[10px] uppercase text-muted sm:w-[8.5rem]">
                Dimension
              </p>
              <p className="truncate pl-2 text-left text-xs font-semibold text-accent">
                {awayLabel}
              </p>
            </div>
            {PRIMARY_ORDER.map((key: PrimaryKey) => {
              const hm = result.homeTeam.metadata[key];
              const am = result.awayTeam.metadata[key];
              return (
                <ComparisonRow
                  key={key}
                  label={PRIMARY_LABELS[key]}
                  homeValue={`${fmt(result.homeTeam.ratings[key], 1)} ${trendArrow(hm?.recent_trend)}`}
                  awayValue={`${fmt(result.awayTeam.ratings[key], 1)} ${trendArrow(am?.recent_trend)}`}
                  info={
                    <>
                      GLPM primary rating for <strong>{PRIMARY_LABELS[key]}</strong>. Arrow shows
                      recent trend (↑ up / ↓ down / → flat).
                    </>
                  }
                />
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-primary">{homeLabel} style</p>
              <StylePills labels={result.homeTeam.style?.labels ?? []} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-accent">{awayLabel} style</p>
              <StylePills labels={result.awayTeam.style?.labels ?? []} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Matchup interactions (Δ)
          </h3>
          <div className="space-y-3 rounded-2xl border border-glass-border bg-surface/60 p-4">
            <InteractionBar
              label="Attack vs Defence"
              homeDelta={result.interactions.home.attack_defence}
              awayDelta={result.interactions.away.attack_defence}
            />
            <InteractionBar
              label="Finishing vs GK"
              homeDelta={result.interactions.home.finishing_goalkeeper}
              awayDelta={result.interactions.away.finishing_goalkeeper}
            />
            <InteractionBar
              label="Build-up vs Pressing"
              homeDelta={result.interactions.home.build_up_pressing}
              awayDelta={result.interactions.away.build_up_pressing}
            />
            <InteractionBar
              label="Possession vs Pressing"
              homeDelta={result.interactions.home.possession_pressing}
              awayDelta={result.interactions.away.possession_pressing}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Markets</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-glass-border bg-surface/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">BTTS</p>
              <div className="mt-2 flex justify-between text-sm">
                <span>
                  Yes <strong className="tabular-nums">{pct(result.bttsYes)}</strong>
                </span>
                <span>
                  No <strong className="tabular-nums">{pct(result.bttsNo)}</strong>
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-glass-border bg-surface/60 p-4 sm:col-span-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Over / Under
              </p>
              <div className="space-y-1.5">
                {Object.entries(result.overUnder)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([line, probs]) => (
                    <div
                      key={line}
                      className="flex items-center justify-between text-sm tabular-nums"
                    >
                      <span className="text-muted">O/U {line}</span>
                      <span>
                        Over {(probs.over * 100).toFixed(0)}% · Under{" "}
                        {(probs.under * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Score probability matrix
          </h3>
          <ScoreHeatmap
            matrix={result.scoreMatrix}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        </section>
      </div>
    </div>
  );
}
