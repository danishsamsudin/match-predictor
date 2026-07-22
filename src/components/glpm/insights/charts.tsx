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
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

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
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RRadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="currentColor" className="text-foreground/15" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "currentColor", fontSize: 11 }}
            className="text-muted"
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, max]}
            tick={{ fill: "currentColor", fontSize: 10 }}
            className="text-muted"
          />
          <Radar
            name={homeLabel}
            dataKey="home"
            stroke={HOME_COLOR}
            fill={HOME_COLOR}
            fillOpacity={0.25}
          />
          <Radar
            name={awayLabel}
            dataKey="away"
            stroke={AWAY_COLOR}
            fill={AWAY_COLOR}
            fillOpacity={0.2}
          />
          <Legend />
          <Tooltip />
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
            formatter={(value: number, name: string) => [
              `${((value / Math.max(total, 1e-9)) * 100).toFixed(1)}%`,
              name,
            ]}
          />
          <Legend />
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
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(v: number) => `${v.toFixed(1)}${valueSuffix}`}
          />
          <Legend />
          <Bar dataKey="home" name={homeLabel} fill={HOME_COLOR} radius={4} />
          <Bar dataKey="away" name={awayLabel} fill={AWAY_COLOR} radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DivergingDeltaBars({
  data,
}: {
  data: Array<{ name: string; home: number; away: number }>;
}) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="home" name="Home Δ" fill={HOME_COLOR} stackId="d" radius={3} />
          <Bar dataKey="away" name="Away Δ" fill={AWAY_COLOR} stackId="d" radius={3} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WaterfallBars({
  data,
}: {
  data: Array<{ name: string; value: number; fill?: string }>;
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => v.toFixed(3)} />
          <Bar dataKey="value" radius={4}>
            {data.map((d, i) => (
              <Cell
                key={`${d.name}-${i}`}
                fill={
                  d.fill ??
                  (d.value >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative)
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
          <Legend />
          <Bar dataKey="over" name="Over" fill={HOME_COLOR} radius={4} />
          <Bar dataKey="under" name="Under" fill={MUTED_COLOR} radius={4} />
        </BarChart>
      </ResponsiveContainer>
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
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
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

export function AreaTrendChart({
  data,
  dataKey,
  name,
  color = HOME_COLOR,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  name: string;
  color?: string;
}) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            fill={color}
            fillOpacity={0.25}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BubbleScatterChart({
  data,
  xLabel,
  yLabel,
}: {
  data: Array<{ name: string; x: number; y: number; z: number; fill?: string }>;
  xLabel: string;
  yLabel: string;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
          <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 11 }} />
          <ZAxis type="number" dataKey="z" range={[60, 280]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill={HOME_COLOR}>
            {data.map((d, i) => (
              <Cell key={`${d.name}-${i}`} fill={d.fill ?? HOME_COLOR} />
            ))}
          </Scatter>
        </ScatterChart>
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
