"use client";

import {
  ResponsiveContainer,
  RadarChart as RRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import type { FinishingDifferential } from "@/lib/glpm/load-insight-ratings";

const HOME_COLOR = "var(--color-primary, #0ea5e9)";
const AWAY_COLOR = "var(--color-accent, #f97316)";
const MUTED_COLOR = "var(--color-muted, #94a3b8)";
const DRAW_COLOR = "#64748b";

export const CHART_COLORS = {
  home: HOME_COLOR,
  away: AWAY_COLOR,
  draw: DRAW_COLOR,
  muted: MUTED_COLOR,
  positive: "#22c55e",
  negative: "#ef4444",
} as const;

type RechartsTooltipPayload = {
  name?: string;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
};

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: RechartsTooltipPayload[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-float-tooltip min-w-[10rem] max-w-[16rem] rounded-2xl border border-glass-border bg-[color:var(--glass-bg)] px-3 py-2.5 text-xs shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {label != null && String(label).length > 0 ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((item, i) => {
          const name = String(item.name ?? item.dataKey ?? "Value");
          const raw = Number(item.value);
          const text = formatter
            ? formatter(raw, name)
            : Number.isFinite(raw)
              ? raw.toFixed(2)
              : String(item.value ?? "-");
          return (
            <li key={`${name}-${i}`} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color ?? HOME_COLOR }}
                />
                <span className="truncate">{name}</span>
              </span>
              <span className="tabular-nums font-semibold text-foreground">{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const RADAR_SHORT: Record<string, string> = {
  Attack: "Attack",
  Defence: "Defence",
  Goalkeeper: "GK",
  "Build-up": "Build-up",
  Possession: "Poss.",
  Pressing: "Press",
  Finishing: "Finish",
};

type DualRadarPoint = { dimension: string; home: number; away: number };

export function DualRadarChart({
  data,
  homeLabel,
  awayLabel,
  max = 100,
}: {
  data: DualRadarPoint[];
  homeLabel: string;
  awayLabel: string;
  max?: number;
}) {
  const plot = data.map((d) => ({
    ...d,
    axis: RADAR_SHORT[d.dimension] ?? d.dimension,
  }));
  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <RRadarChart data={plot} cx="50%" cy="52%" outerRadius="68%" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <PolarGrid stroke="currentColor" className="text-foreground/12" gridType="polygon" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "currentColor", fontSize: 11, fontWeight: 600 }}
            className="text-foreground/80"
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, max]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name={homeLabel}
            dataKey="home"
            stroke={HOME_COLOR}
            fill={HOME_COLOR}
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Radar
            name={awayLabel}
            dataKey="away"
            stroke={AWAY_COLOR}
            fill={AWAY_COLOR}
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(1)} />} />
        </RRadarChart>
      </ResponsiveContainer>
    </div>
  );
}

type DonutSlice = { name: string; value: number; color?: string };

export function OutcomeDonut({
  slices,
  centerLabel,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <div className="relative mx-auto h-48 w-full max-w-xs">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
          >
            {slices.map((s, i) => (
              <Cell
                key={s.name}
                fill={s.color ?? [HOME_COLOR, DRAW_COLOR, AWAY_COLOR][i % 3]}
              />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value) =>
                  `${((value / Math.max(total, 1e-9)) * 100).toFixed(1)}%`
                }
              />
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-[5.5rem] text-center text-[10px] font-medium uppercase tracking-wide text-muted">
            {centerLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function GroupedCompareBars({
  data,
  homeLabel,
  awayLabel,
  valueSuffix = "",
}: {
  data: Array<{ name: string; home: number; away: number }>;
  homeLabel: string;
  awayLabel: string;
  valueSuffix?: string;
}) {
  const rowH = Math.max(220, data.length * 36);
  return (
    <div className="w-full" style={{ height: Math.min(rowH, 420) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={
              <ChartTooltip formatter={(v) => `${v.toFixed(1)}${valueSuffix}`} />
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="home" name={homeLabel} fill={HOME_COLOR} radius={4} maxBarSize={14} />
          <Bar dataKey="away" name={awayLabel} fill={AWAY_COLOR} radius={4} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DomainCompareList({
  groups,
  homeLabel,
  awayLabel,
}: {
  groups: Array<{
    title: string;
    rows: Array<{ name: string; home: number; away: number }>;
  }>;
  homeLabel: string;
  awayLabel: string;
}) {
  const max = Math.max(
    ...groups.flatMap((g) => g.rows.flatMap((r) => [r.home, r.away])),
    1
  );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="font-medium text-primary">{homeLabel}</span>
        <span className="font-medium text-accent">{awayLabel}</span>
      </div>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            {group.title}
          </p>
          <div className="space-y-2.5">
            {group.rows.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="tabular-nums text-primary">{row.home.toFixed(1)}</span>
                  <span className="font-medium text-foreground">{row.name}</span>
                  <span className="tabular-nums text-accent">{row.away.toFixed(1)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="flex h-2 justify-end overflow-hidden rounded-l-full bg-foreground/10">
                    <div
                      className="h-full rounded-l-full bg-primary"
                      style={{ width: `${(row.home / max) * 100}%` }}
                    />
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-r-full bg-foreground/10">
                    <div
                      className="h-full rounded-r-full bg-accent"
                      style={{ width: `${(row.away / max) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchupTugList({
  data,
  homeLabel,
  awayLabel,
}: {
  data: Array<{ name: string; detail: string; home: number; away: number }>;
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <div className="space-y-4">
      {data.map((row) => {
        const homeLead = row.home >= row.away;
        const edge = homeLead ? row.home - row.away : row.away - row.home;
        const leader = homeLead ? homeLabel : awayLabel;
        const span = Math.max(Math.abs(row.home), Math.abs(row.away), 0.25);
        const homeW = (Math.abs(row.home) / span) * 100;
        const awayW = (Math.abs(row.away) / span) * 100;
        return (
          <div
            key={row.name}
            className="rounded-2xl border border-glass-border bg-surface/50 px-3 py-3"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{row.name}</p>
                <p className="text-[11px] text-muted">{row.detail}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  homeLead
                    ? "bg-primary/15 text-primary"
                    : "bg-accent/15 text-accent"
                }`}
              >
                {leader} +{edge.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-right">
                <p className="text-[10px] uppercase text-muted">{homeLabel}</p>
                <p className="text-sm font-bold tabular-nums text-primary">
                  {row.home >= 0 ? "+" : ""}
                  {row.home.toFixed(2)}
                </p>
                <div className="mt-1 ml-auto h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="ml-auto h-full rounded-full bg-primary"
                    style={{ width: `${homeW}%` }}
                  />
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/5 text-[10px] font-semibold text-muted">
                vs
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted">{awayLabel}</p>
                <p className="text-sm font-bold tabular-nums text-accent">
                  {row.away >= 0 ? "+" : ""}
                  {row.away.toFixed(2)}
                </p>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${awayW}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type CxFactorStep = {
  name: string;
  multiplier: number;
  xg: number;
  delta: number;
  detail: string;
};

export function CxFactorPanel({
  homeSteps,
  awaySteps,
  homeLabel,
  awayLabel,
}: {
  homeSteps: CxFactorStep[];
  awaySteps: CxFactorStep[];
  homeLabel: string;
  awayLabel: string;
}) {
  const homeBase = homeSteps[0];
  const awayBase = awaySteps[0];
  const homeFinal = homeSteps[homeSteps.length - 1];
  const awayFinal = awaySteps[awaySteps.length - 1];
  const rows = homeSteps.slice(1).map((home, i) => ({
    name: home.name,
    homeMult: home.multiplier,
    awayMult: awaySteps[i + 1]?.multiplier ?? 1,
    homeDetail: home.detail,
    awayDetail: awaySteps[i + 1]?.detail ?? "",
  }));
  const moved = rows.some(
    (r) => Math.abs(r.homeMult - 1) >= 0.005 || Math.abs(r.awayMult - 1) >= 0.005
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CxXgDelta
          label={homeLabel}
          from={homeBase?.xg ?? 0}
          to={homeFinal?.xg ?? 0}
          accent="home"
        />
        <CxXgDelta
          label={awayLabel}
          from={awayBase?.xg ?? 0}
          to={awayFinal?.xg ?? 0}
          accent="away"
        />
      </div>
      {!moved ? (
        <p className="text-xs text-muted">
          Context is neutral. Every multiplier is 1.000, so CX xG matches the base model.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-glass-border text-[11px] font-medium uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 text-left font-medium">Factor</th>
              <th className="py-2 px-2 text-right font-medium text-primary">{homeLabel}</th>
              <th className="py-2 pl-2 text-right font-medium text-accent">{awayLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-glass-border/60">
                <td className="py-2 pr-3">
                  <p className="font-medium text-foreground">{row.name}</p>
                  {Math.abs(row.homeMult - 1) >= 0.005 ||
                  Math.abs(row.awayMult - 1) >= 0.005 ? (
                    <p className="text-[11px] text-muted">
                      {row.homeDetail === row.awayDetail
                        ? row.homeDetail
                        : `${row.homeDetail} / ${row.awayDetail}`}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <CxMult value={row.homeMult} />
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  <CxMult value={row.awayMult} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CxXgDelta({
  label,
  from,
  to,
  accent,
}: {
  label: string;
  from: number;
  to: number;
  accent: "home" | "away";
}) {
  const color = accent === "home" ? "text-primary" : "text-accent";
  const changed = Math.abs(to - from) >= 0.005;
  return (
    <div className="rounded-xl border border-glass-border bg-surface/50 px-3 py-3">
      <p className={`text-[11px] font-medium uppercase tracking-wide ${color}`}>{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
        {from.toFixed(2)}
        <span className="mx-1.5 text-xs font-medium text-muted"> to </span>
        {to.toFixed(2)}
      </p>
      <p className="text-[11px] tabular-nums text-muted">
        {changed ? `${to - from > 0 ? "+" : ""}${(to - from).toFixed(3)} xG` : "no change"}
      </p>
    </div>
  );
}

function CxMult({ value }: { value: number }) {
  const moved = Math.abs(value - 1) >= 0.005;
  return (
    <span
      className={`font-semibold ${
        moved ? (value > 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500") : "text-muted"
      }`}
    >
      × {value.toFixed(3)}
    </span>
  );
}

export function RestDaysCompare({
  homeDays,
  awayDays,
  homeNote,
  awayNote,
  homeLabel,
  awayLabel,
  estimated,
}: {
  homeDays: number | null;
  awayDays: number | null;
  homeNote: string | null;
  awayNote: string | null;
  homeLabel: string;
  awayLabel: string;
  estimated: boolean;
}) {
  const scale = 14;
  const home = homeDays ?? 7;
  const away = awayDays ?? 7;
  return (
    <div className="rounded-xl border border-glass-border bg-surface/50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-foreground">Days between matches</h5>
        {estimated ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            Estimated
          </span>
        ) : null}
      </div>
      <RestMeter label={homeLabel} days={home} scale={scale} accent="home" />
      <div className="mt-3">
        <RestMeter label={awayLabel} days={away} scale={scale} accent="away" />
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-muted">
        <span className="absolute left-0">0d</span>
        <span className="absolute left-[50%] -translate-x-1/2">7d typical</span>
        <span className="absolute right-0">14d+</span>
      </div>
      {(() => {
        const notes = [...new Set([homeNote, awayNote].filter(Boolean))];
        if (!notes.length) return null;
        return (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{notes.join(" ")}</p>
        );
      })()}
    </div>
  );
}

function RestMeter({
  label,
  days,
  scale,
  accent,
}: {
  label: string;
  days: number;
  scale: number;
  accent: "home" | "away";
}) {
  const pct = Math.min(100, (days / scale) * 100);
  const congested = days < 3;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className={accent === "home" ? "text-primary" : "text-accent"}>{label}</span>
        <span className="tabular-nums font-semibold text-foreground">
          {days.toFixed(1)} days
          {congested ? " · congested" : ""}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={`h-full rounded-full ${
            congested
              ? "bg-rose-500"
              : accent === "home"
                ? "bg-primary"
                : "bg-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${(7 / scale) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function FinishingCompare({
  home,
  away,
  homeLabel,
  awayLabel,
}: {
  home: FinishingDifferential | null;
  away: FinishingDifferential | null;
  homeLabel: string;
  awayLabel: string;
}) {
  if (!home && !away) {
    return (
      <p className="text-xs text-muted">
        Finishing differential needs season goals and xG for both sides.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {home ? <FinishingCard team={homeLabel} row={home} accent="home" /> : null}
      {away ? <FinishingCard team={awayLabel} row={away} accent="away" /> : null}
    </div>
  );
}

function finishingSourceLabel(row: FinishingDifferential): string {
  if (row.source === "understat") return `Understat · ${row.matches} matches`;
  if (row.source === "provider") return `Provider xG · ${row.matches} matches`;
  return `Proxy xG · ${row.matches} matches`;
}

function FinishingCard({
  team,
  row,
  accent,
}: {
  team: string;
  row: FinishingDifferential;
  accent: "home" | "away";
}) {
  const max = Math.max(row.goals, row.xg, 1);
  const over = row.delta >= 0;
  return (
    <div className="rounded-xl border border-glass-border bg-surface/50 p-4">
      <p className={`text-sm font-semibold ${accent === "home" ? "text-primary" : "text-accent"}`}>
        {team}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          over ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
        }`}
      >
        {over ? "+" : ""}
        {row.delta.toFixed(1)}
      </p>
      <p className="text-[11px] text-muted">{finishingSourceLabel(row)}</p>
      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted">
            <span>Goals</span>
            <span className="tabular-nums font-medium text-foreground">{row.goals.toFixed(1)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: `${(row.goals / max) * 100}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted">
            <span>xG</span>
            <span className="tabular-nums font-medium text-foreground">{row.xg.toFixed(1)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={`h-full rounded-full ${accent === "home" ? "bg-primary" : "bg-accent"}`}
              style={{ width: `${(row.xg / max) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function OuLadderBars({
  data,
}: {
  data: Array<{ line: string; over: number; under: number }>;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis dataKey="line" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="over" name="Over" fill={HOME_COLOR} radius={4} />
          <Bar dataKey="under" name="Under" fill={MUTED_COLOR} radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BttsPanel({ yes, no }: { yes: number; no: number }) {
  const rows = [
    {
      code: "Yes",
      label: "Both score",
      prob: yes,
      odds: fairOddsFromProb(yes)?.toFixed(2) ?? "-",
    },
    {
      code: "No",
      label: "One or neither",
      prob: no,
      odds: fairOddsFromProb(no)?.toFixed(2) ?? "-",
    },
  ];
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.code}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="font-semibold">{row.code}</span>
              <span className="text-muted"> {row.label}</span>
            </span>
            <span className="tabular-nums font-semibold">{(row.prob * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${Math.min(100, row.prob * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-muted">Fair {row.odds}</p>
        </div>
      ))}
    </div>
  );
}

export function DoubleChanceList({
  rows,
}: {
  rows: Array<{ code: string; label: string; prob: number }>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.code}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="font-semibold">{row.code}</span>
              <span className="text-muted"> {row.label}</span>
            </span>
            <span className="tabular-nums font-semibold">{(row.prob * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${Math.min(100, row.prob * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TeamTotalsTable({
  rows,
  homeLabel,
  awayLabel,
}: {
  rows: Array<{
    line: number;
    homeOver: number;
    homeUnder: number;
    awayOver: number;
    awayUnder: number;
  }>;
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-glass-border text-[11px] font-medium uppercase tracking-wide text-muted">
            <th className="py-2 pr-2 text-left font-medium">Line</th>
            <th className="py-2 px-2 text-right font-medium text-primary" colSpan={2}>
              {homeLabel}
            </th>
            <th className="py-2 pl-2 text-right font-medium text-accent" colSpan={2}>
              {awayLabel}
            </th>
          </tr>
          <tr className="border-b border-glass-border text-[11px] uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-2 text-left font-medium" />
            <th className="py-1.5 px-2 text-right font-medium">Over</th>
            <th className="py-1.5 px-2 text-right font-medium">Under</th>
            <th className="py-1.5 px-2 text-right font-medium">Over</th>
            <th className="py-1.5 pl-2 text-right font-medium">Under</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-b border-glass-border/50">
              <td className="py-2 pr-2 tabular-nums font-medium">{row.line}</td>
              <td className="py-2 px-2 text-right tabular-nums">
                {(row.homeOver * 100).toFixed(1)}%
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-muted">
                {(row.homeUnder * 100).toFixed(1)}%
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {(row.awayOver * 100).toFixed(1)}%
              </td>
              <td className="py-2 pl-2 text-right tabular-nums text-muted">
                {(row.awayUnder * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StyleClashPills({
  clashes,
  formatLabel,
}: {
  clashes: Array<{ home: string; away: string; label: string }>;
  formatLabel: (raw: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {clashes.map((m) =>
        m.home === m.away ? (
          <div key={`${m.home}-${m.away}-${m.label}`} className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-glass-border bg-surface/70 px-2.5 py-0.5 text-[11px] text-foreground">
              {formatLabel(m.home)}
            </span>
            <span className="text-[11px] text-muted">both sides</span>
          </div>
        ) : (
          <div
            key={`${m.home}-${m.away}-${m.label}`}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary">
              {formatLabel(m.home)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              vs
            </span>
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent">
              {formatLabel(m.away)}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function EdgeBars({
  data,
}: {
  data: Array<{ market: string; edgePct: number }>;
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis type="category" dataKey="market" width={110} tick={{ fontSize: 10 }} />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
          <Bar dataKey="edgePct" name="Edge" radius={4}>
            {data.map((d, i) => (
              <Cell
                key={`${d.market}-${i}`}
                fill={d.edgePct >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiMeter({
  label,
  value,
  hint,
  accent = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "accent" | "neutral";
}) {
  const color =
    accent === "primary"
      ? "text-primary"
      : accent === "accent"
        ? "text-accent"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-glass-border bg-surface/60 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
