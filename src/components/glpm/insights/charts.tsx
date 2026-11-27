"use client";

import { useState, type ReactNode } from "react";
import {
  ResponsiveContainer,
  RadarChart as RRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import type { FinishingDifferential } from "@/lib/glpm/load-insight-ratings";
import { resolveTeamLogo } from "@/lib/data/team-logos";
import type { EntityType } from "@/lib/types/football-lookup";

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

const CHART_CURSOR = false;

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
    <div
      className="chart-float-tooltip min-w-[10rem] max-w-[16rem] rounded-xl px-3 py-2.5 text-xs"
      style={{
        background: "var(--chart-tooltip-bg)",
        color: "var(--chart-tooltip-fg)",
        border: "1px solid var(--chart-tooltip-border)",
        boxShadow: "var(--chart-tooltip-shadow)",
      }}
    >
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
  const gaps = data.map((row) => ({
    ...row,
    gap: Math.abs(row.home - row.away),
    leader: row.home === row.away ? "even" : row.home > row.away ? "home" : "away",
  }));
  const homeLeads = gaps.filter((r) => r.leader === "home").length;
  const awayLeads = gaps.filter((r) => r.leader === "away").length;
  const biggest = [...gaps].sort((a, b) => b.gap - a.gap)[0];
  const summary =
    homeLeads === awayLeads
      ? `Even profile (${homeLeads} each)`
      : homeLeads > awayLeads
        ? `${homeLabel} leads ${homeLeads}/${gaps.length}`
        : `${awayLabel} leads ${awayLeads}/${gaps.length}`;
  const gapNote =
    biggest && biggest.gap >= 1
      ? ` · largest gap ${biggest.dimension} (+${biggest.gap.toFixed(1)})`
      : "";

  return (
    <div>
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
      <p className="type-meta mt-1 text-center">
        {summary}
        {gapNote}
      </p>
    </div>
  );
}

const STAT_AXIS_SHORT: Record<string, string> = {
  "Expected goals": "xG",
  "xG-Elo rating": "xG-Elo",
  "Tournament rating (WCTR)": "WCTR",
  "Attack process rate": "Attack",
  "Defense process rate": "Defence",
  "Goals scored": "GF",
  "Goals conceded": "GA",
  "Shots on target": "SoT",
  Corners: "Corners",
  Fouls: "Fouls",
};

/**
 * Per-axis padded min-max → 0–100 so close values (e.g. Elo 1479 vs 1459)
 * still separate on the radar instead of both sitting at the rim.
 */
function relativeNormPair(home: number, away: number): {
  homeNorm: number;
  awayNorm: number;
} {
  const lo = Math.min(home, away);
  const hi = Math.max(home, away);
  const span = hi - lo;
  const magnitude = Math.max(Math.abs(hi), Math.abs(lo), 1e-9);
  const pad = Math.max(span * 0.85, magnitude * 0.02, 1e-6);
  const domainLo = lo - pad;
  const domainHi = hi + pad;
  const range = domainHi - domainLo;
  return {
    homeNorm: ((home - domainLo) / range) * 100,
    awayNorm: ((away - domainLo) / range) * 100,
  };
}

function formatStatValue(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 100) {
    return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
  }
  if (Math.abs(n) >= 10) return n.toFixed(2);
  const fixed = n.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/**
 * Radar for mixed-scale season stats. Each axis is scaled relative to that
 * metric's home/away pair so small gaps stay visible. Side panel shows raw values.
 */
export function RelativeScaleRadarChart({
  data,
  homeLabel,
  awayLabel,
}: {
  data: DualRadarPoint[];
  homeLabel: string;
  awayLabel: string;
}) {
  const scaled = data.map((row) => {
    const { homeNorm, awayNorm } = relativeNormPair(row.home, row.away);
    const axis =
      STAT_AXIS_SHORT[row.dimension] ??
      (row.dimension.length > 14 ? row.dimension.slice(0, 12) + "…" : row.dimension);
    return {
      dimension: row.dimension,
      axis,
      homeRaw: row.home,
      awayRaw: row.away,
      home: homeNorm,
      away: awayNorm,
      gap: Math.abs(row.home - row.away),
      leader:
        row.home === row.away ? ("even" as const) : row.home > row.away ? ("home" as const) : ("away" as const),
    };
  });

  const homeLeads = scaled.filter((r) => r.leader === "home").length;
  const awayLeads = scaled.filter((r) => r.leader === "away").length;
  const biggest = [...scaled].sort((a, b) => b.gap - a.gap)[0];
  const headline =
    homeLeads === awayLeads
      ? `Profiles are close - each side leads ${homeLeads} of ${scaled.length} metrics.`
      : homeLeads > awayLeads
        ? `${homeLabel} leads ${homeLeads} of ${scaled.length} metrics.`
        : `${awayLabel} leads ${awayLeads} of ${scaled.length} metrics.`;
  const gapNote = biggest
    ? `Largest raw gap: ${biggest.dimension} (${
        biggest.leader === "home" ? homeLabel : awayLabel
      } +${formatStatValue(biggest.gap)}).`
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.9fr)] lg:items-start">
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RRadarChart
            data={scaled}
            cx="50%"
            cy="52%"
            outerRadius="68%"
            margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
          >
            <PolarGrid stroke="currentColor" className="text-foreground/12" gridType="polygon" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "currentColor", fontSize: 11, fontWeight: 600 }}
              className="text-foreground/80"
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
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
            <Tooltip
              cursor={CHART_CURSOR}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = scaled.find((r) => r.axis === label);
                if (!row) return null;
                return (
                  <div
                    className="chart-float-tooltip min-w-[10rem] max-w-[18rem] rounded-xl px-3 py-2.5 text-xs"
                    style={{
                      background: "var(--chart-tooltip-bg)",
                      color: "var(--chart-tooltip-fg)",
                      border: "1px solid var(--chart-tooltip-border)",
                      boxShadow: "var(--chart-tooltip-shadow)",
                    }}
                  >
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {row.dimension}
                    </p>
                    <ul className="space-y-1">
                      <li className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: HOME_COLOR }}
                          />
                          <span className="truncate">{homeLabel}</span>
                        </span>
                        <span className="tabular-nums font-semibold">
                          {formatStatValue(row.homeRaw)}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: AWAY_COLOR }}
                          />
                          <span className="truncate">{awayLabel}</span>
                        </span>
                        <span className="tabular-nums font-semibold">
                          {formatStatValue(row.awayRaw)}
                        </span>
                      </li>
                    </ul>
                  </div>
                );
              }}
            />
          </RRadarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-[10px] text-muted">
          Axes use relative scaling per metric so small gaps stay visible.
        </p>
      </div>

      <div className="rounded-xl border border-glass-border bg-surface/50 p-3 sm:p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Raw values
        </p>
        <p className="mt-1 text-sm leading-snug text-foreground">{headline}</p>
        {gapNote ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{gapNote}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span className="font-medium text-primary">{homeLabel}</span>
          <span className="font-medium text-accent">{awayLabel}</span>
        </div>
        <div className="mt-2 space-y-2.5">
          {scaled.map((row) => (
            <div key={row.dimension}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="tabular-nums text-primary">
                  {formatStatValue(row.homeRaw)}
                </span>
                <span className="min-w-0 truncate text-center font-medium text-foreground">
                  {row.axis}
                </span>
                <span className="tabular-nums text-accent">
                  {formatStatValue(row.awayRaw)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex h-2 justify-end overflow-hidden rounded-l-full bg-foreground/10">
                  <div
                    className="h-full rounded-l-full bg-primary"
                    style={{ width: `${row.home}%` }}
                  />
                </div>
                <div className="flex h-2 overflow-hidden rounded-r-full bg-foreground/10">
                  <div
                    className="h-full rounded-r-full bg-accent"
                    style={{ width: `${row.away}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function outcomePct(p: number): string {
  return `${(Math.max(0, p) * 100).toFixed(1)}%`;
}

function outcomeOdds(p: number): string {
  const odds = fairOddsFromProb(p);
  return odds != null ? odds.toFixed(2) : "-";
}

function ClubCrest({ name, src }: { name: string; src: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-surface text-[10px] font-semibold text-muted sm:h-11 sm:w-11"
        aria-hidden
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local /team-logos files
    <img
      src={src}
      alt=""
      width={44}
      height={44}
      className="h-10 w-10 object-contain sm:h-11 sm:w-11"
      onError={() => setBroken(true)}
    />
  );
}

function OutcomeTeamMark({
  name,
  teamId,
  pct,
  odds,
  tone,
  entityType = "club",
  priorPct,
  priorTitle,
  priorSeasonLabel,
}: {
  name: string;
  teamId: number;
  pct: string;
  odds: string;
  tone: "home" | "away";
  entityType?: EntityType;
  priorPct?: string | null;
  priorTitle?: string | null;
  priorSeasonLabel?: string | null;
}) {
  const src = resolveTeamLogo({ id: teamId, name }, entityType);
  const valueClass = tone === "home" ? "text-primary" : "text-accent";
  return (
    <div className="flex w-[6.5rem] flex-col items-center text-center sm:w-32">
      <ClubCrest name={name} src={src} />
      <p className={`mt-1.5 w-full truncate text-xs font-medium ${valueClass}`}>{name}</p>
      <p className={`text-lg font-bold tabular-nums sm:text-xl ${valueClass}`}>{pct}</p>
      {priorPct ? (
        <p className="glpm-prior-season" title={priorTitle ?? undefined}>
          ({priorSeasonLabel ? `${priorSeasonLabel} ` : ""}
          {priorPct})
        </p>
      ) : null}
      <p className="text-[11px] tabular-nums text-muted">odds {odds}</p>
    </div>
  );
}

export function OutcomeBar({
  home,
  draw,
  away,
  homeLabel,
  awayLabel,
  homeTeamId,
  awayTeamId,
  entityType = "club",
  priorHome,
  priorDraw,
  priorAway,
  priorTitle,
  priorSeasonLabel,
}: {
  home: number;
  draw: number;
  away: number;
  homeLabel: string;
  awayLabel: string;
  homeTeamId: number;
  awayTeamId: number;
  entityType?: EntityType;
  priorHome?: number | null;
  priorDraw?: number | null;
  priorAway?: number | null;
  priorTitle?: string | null;
  priorSeasonLabel?: string | null;
}) {
  const h = Math.max(0, home) * 100;
  const d = Math.max(0, draw) * 100;
  const a = Math.max(0, away) * 100;
  const showPrior =
    priorHome != null &&
    priorDraw != null &&
    priorAway != null &&
    (Math.abs(priorHome - home) > 0.0005 ||
      Math.abs(priorDraw - draw) > 0.0005 ||
      Math.abs(priorAway - away) > 0.0005);
  return (
    <div className="space-y-3">
      <div className="relative h-[8.5rem] sm:h-[9rem]">
        <div className="absolute left-1/4 top-0 -translate-x-1/2">
          <OutcomeTeamMark
            name={homeLabel}
            teamId={homeTeamId}
            pct={outcomePct(home)}
            odds={outcomeOdds(home)}
            tone="home"
            entityType={entityType}
            priorPct={showPrior && priorHome != null ? outcomePct(priorHome) : null}
            priorTitle={priorTitle}
            priorSeasonLabel={priorSeasonLabel}
          />
        </div>
        <div className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 flex-col items-center justify-end pb-0.5 text-center">
          <p className="text-xs font-medium text-muted">Draw</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {outcomePct(draw)}
          </p>
          {showPrior && priorDraw != null ? (
            <p className="glpm-prior-season" title={priorTitle ?? undefined}>
              ({priorSeasonLabel ? `${priorSeasonLabel} ` : ""}
              {outcomePct(priorDraw)})
            </p>
          ) : null}
          <p className="text-[11px] tabular-nums text-muted">odds {outcomeOdds(draw)}</p>
        </div>
        <div className="absolute left-3/4 top-0 -translate-x-1/2">
          <OutcomeTeamMark
            name={awayLabel}
            teamId={awayTeamId}
            pct={outcomePct(away)}
            odds={outcomeOdds(away)}
            tone="away"
            entityType={entityType}
            priorPct={showPrior && priorAway != null ? outcomePct(priorAway) : null}
            priorTitle={priorTitle}
            priorSeasonLabel={priorSeasonLabel}
          />
        </div>
      </div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"
        role="img"
        aria-label={`${homeLabel} ${outcomePct(home)}, draw ${outcomePct(draw)}, ${awayLabel} ${outcomePct(away)}`}
      >
        <div className="bg-primary transition-all" style={{ width: `${h}%` }} />
        <div className="bg-slate-400/70 transition-all dark:bg-slate-500" style={{ width: `${d}%` }} />
        <div className="bg-accent transition-all" style={{ width: `${a}%` }} />
      </div>
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
  const rowH = Math.max(160, data.length * 32 + 48);
  return (
    <div className="w-full" style={{ height: Math.min(rowH, 280) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 0 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            cursor={CHART_CURSOR}
            content={
              <ChartTooltip formatter={(v) => `${v.toFixed(1)}${valueSuffix}`} />
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="home" name={homeLabel} fill={HOME_COLOR} radius={4} maxBarSize={12} />
          <Bar dataKey="away" name={awayLabel} fill={AWAY_COLOR} radius={4} maxBarSize={12} />
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
    <div className="space-y-4">
      <div className="flex items-center justify-between type-meta">
        <span className="font-medium text-primary">{homeLabel}</span>
        <span className="font-medium text-accent">{awayLabel}</span>
      </div>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1 type-meta font-semibold uppercase tracking-wide">
            {group.title}
          </p>
          <div>
            {group.rows.map((row) => {
              const homeW = (row.home / max) * 100;
              const awayW = (row.away / max) * 100;
              return (
                <div
                  key={row.name}
                  className="border-b border-glass-border/50 py-2 last:border-b-0"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="w-12 tabular-nums font-semibold text-primary">
                      {row.home.toFixed(1)}
                    </span>
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="w-12 text-right tabular-nums font-semibold text-accent">
                      {row.away.toFixed(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-foreground/10">
                      <div
                        className="h-full rounded-l-full bg-primary"
                        style={{ width: `${homeW}%` }}
                      />
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-r-full bg-foreground/10">
                      <div
                        className="h-full rounded-r-full bg-accent"
                        style={{ width: `${awayW}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
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
    <div>
      <div className="mb-1 flex items-center justify-between type-meta uppercase tracking-wide">
        <span className="font-medium text-primary">{homeLabel}</span>
        <span className="font-medium text-accent">{awayLabel}</span>
      </div>
      {data.map((row) => {
        const homeLead = row.home >= row.away;
        const edge = Math.abs(row.home - row.away);
        const leader = homeLead ? homeLabel : awayLabel;
        const span = Math.max(Math.abs(row.home), Math.abs(row.away), 0.25);
        const homeW = (Math.abs(row.home) / span) * 100;
        const awayW = (Math.abs(row.away) / span) * 100;
        return (
          <div
            key={row.name}
            className="border-b border-glass-border/50 py-2 last:border-b-0"
            title={row.detail}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-medium uppercase tracking-wide text-foreground">
                {row.name}
              </p>
              <span
                className={`shrink-0 text-[10px] font-semibold tabular-nums ${
                  homeLead ? "text-primary" : "text-accent"
                }`}
              >
                {leader} +{edge.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
              <span className="font-semibold text-primary">
                {row.home >= 0 ? "+" : ""}
                {row.home.toFixed(2)}
              </span>
              <span className="font-semibold text-accent">
                {row.away >= 0 ? "+" : ""}
                {row.away.toFixed(2)}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-foreground/10">
                <div
                  className="h-full rounded-l-full bg-primary"
                  style={{ width: `${homeW}%` }}
                />
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-r-full bg-foreground/10">
                <div
                  className="h-full rounded-r-full bg-accent"
                  style={{ width: `${awayW}%` }}
                />
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

  const homeDelta = (homeFinal?.xg ?? 0) - (homeBase?.xg ?? 0);
  const awayDelta = (awayFinal?.xg ?? 0) - (awayBase?.xg ?? 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="type-meta text-primary">{homeLabel} xG</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {(homeBase?.xg ?? 0).toFixed(2)}
            <span className="mx-1 text-xs font-medium text-muted">to</span>
            {(homeFinal?.xg ?? 0).toFixed(2)}
          </p>
          <p className="type-meta tabular-nums">
            {Math.abs(homeDelta) >= 0.005
              ? `${homeDelta > 0 ? "+" : ""}${homeDelta.toFixed(3)}`
              : "no change"}
          </p>
        </div>
        <div className="text-right">
          <p className="type-meta text-accent">{awayLabel} xG</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {(awayBase?.xg ?? 0).toFixed(2)}
            <span className="mx-1 text-xs font-medium text-muted">to</span>
            {(awayFinal?.xg ?? 0).toFixed(2)}
          </p>
          <p className="type-meta tabular-nums">
            {Math.abs(awayDelta) >= 0.005
              ? `${awayDelta > 0 ? "+" : ""}${awayDelta.toFixed(3)}`
              : "no change"}
          </p>
        </div>
      </div>
      {!moved ? (
        <p className="type-meta">All multipliers at 1.000 - CX matches base.</p>
      ) : null}
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-glass-border type-meta uppercase">
            <th className="py-2 pr-3 text-left font-medium">Factor</th>
            <th className="truncate py-2 px-2 text-right font-medium text-primary">
              {homeLabel}
            </th>
            <th className="truncate py-2 pl-2 text-right font-medium text-accent">
              {awayLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-glass-border/50">
              <td className="py-2 pr-3 font-medium text-foreground">{row.name}</td>
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
  homeNote: _homeNote,
  awayNote: _awayNote,
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
  void _homeNote;
  void _awayNote;
  const scale = 14;
  const home = homeDays ?? 7;
  const away = awayDays ?? 7;
  return (
    <div className="border-t border-glass-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h5 className="type-meta font-semibold uppercase tracking-wide">Rest</h5>
        {estimated ? (
          <span className="type-meta text-amber-700 dark:text-amber-300">Estimated</span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RestMeter label={homeLabel} days={home} scale={scale} accent="home" />
        <RestMeter label={awayLabel} days={away} scale={scale} accent="away" />
      </div>
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
    return <p className="type-meta">No season goals/xG for this pair yet.</p>;
  }

  const cells = [
    home ? { team: homeLabel, row: home, accent: "home" as const } : null,
    away ? { team: awayLabel, row: away, accent: "away" as const } : null,
  ].filter(Boolean) as Array<{
    team: string;
    row: FinishingDifferential;
    accent: "home" | "away";
  }>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cells.map(({ team, row, accent }) => {
        const over = row.delta >= 0;
        return (
          <div key={team} className="border-b border-glass-border/50 pb-3 sm:border-b-0 sm:pb-0">
            <p
              className={`text-sm font-medium ${
                accent === "home" ? "text-primary" : "text-accent"
              }`}
            >
              {team}
            </p>
            <p
              className={`mt-0.5 text-xl font-semibold tabular-nums ${
                over ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
              }`}
              title={`G ${row.goals.toFixed(1)} · xG ${row.xg.toFixed(1)} · n=${row.matches}`}
            >
              {over ? "+" : ""}
              {row.delta.toFixed(1)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function OuLadderBars({
  data,
}: {
  data: Array<{ line: string; over: number; under: number }>;
}) {
  return (
    <div className="h-64 w-full min-w-0 lg:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis dataKey="line" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={CHART_CURSOR}
            content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />}
          />
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
    <div className="table-h-scroll">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-glass-border type-meta uppercase h-9">
            <th className="py-2 pr-2 text-left font-medium align-bottom">Line</th>
            <th className="py-2 px-2 text-right font-medium text-primary align-bottom" colSpan={2}>
              {homeLabel}
            </th>
            <th className="py-2 pl-2 text-right font-medium text-accent align-bottom" colSpan={2}>
              {awayLabel}
            </th>
          </tr>
          <tr className="border-b border-glass-border type-meta uppercase h-8">
            <th className="py-1.5 pr-2 text-left font-medium" />
            <th className="py-1.5 px-2 text-right font-medium">Over</th>
            <th className="py-1.5 px-2 text-right font-medium">Under</th>
            <th className="py-1.5 px-2 text-right font-medium">Over</th>
            <th className="py-1.5 pl-2 text-right font-medium">Under</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-b border-glass-border/50 h-10">
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

function formatStyleMetric(
  value: number | null | undefined,
  digits: number,
  suffix = ""
): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}${suffix}`;
}

export function StyleMetricsCompare({
  homeLabel,
  awayLabel,
  homePossession,
  awayPossession,
  homePpda,
  awayPpda,
}: {
  homeLabel: string;
  awayLabel: string;
  homePossession: number | null;
  awayPossession: number | null;
  homePpda: number | null;
  awayPpda: number | null;
}) {
  const possHome = homePossession ?? 0;
  const possAway = awayPossession ?? 0;
  const ppdaHome = homePpda ?? 0;
  const ppdaAway = awayPpda ?? 0;
  const possMax = Math.max(possHome, possAway, 1);
  const ppdaMax = Math.max(ppdaHome, ppdaAway, 1);

  const rows = [
    {
      label: "Possession",
      home: possHome,
      away: possAway,
      homeDisplay: formatStyleMetric(homePossession, 0, "%"),
      awayDisplay: formatStyleMetric(awayPossession, 0, "%"),
      max: possMax,
      lowerIsBetter: false,
    },
    {
      label: "PPDA",
      home: ppdaHome,
      away: ppdaAway,
      homeDisplay: formatStyleMetric(homePpda, 1),
      awayDisplay: formatStyleMetric(awayPpda, 1),
      max: ppdaMax,
      lowerIsBetter: true,
    },
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between type-meta">
        <span className="font-medium text-primary">{homeLabel}</span>
        <span className="font-medium text-accent">{awayLabel}</span>
      </div>
      {rows.map((row) => {
        const homeW = (row.home / row.max) * 100;
        const awayW = (row.away / row.max) * 100;
        return (
          <div
            key={row.label}
            className="border-b border-glass-border/50 py-2.5 last:border-b-0"
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="w-14 tabular-nums font-semibold text-primary">
                {row.homeDisplay}
              </span>
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="w-14 text-right tabular-nums font-semibold text-accent">
                {row.awayDisplay}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-foreground/10">
                <div
                  className="h-full rounded-l-full bg-primary"
                  style={{ width: `${homeW}%` }}
                />
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-r-full bg-foreground/10">
                <div
                  className="h-full rounded-r-full bg-accent"
                  style={{ width: `${awayW}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
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
          <Tooltip
            cursor={CHART_CURSOR}
            content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />}
          />
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
  value: ReactNode;
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
    <div className="min-w-0">
      <p className="type-meta truncate">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="type-meta mt-0.5 truncate">{hint}</p> : null}
    </div>
  );
}
