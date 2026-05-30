"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  MapPin,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { PredictionResult } from "@/lib/types/prediction";

type Accent =
  | "emerald"
  | "blue"
  | "indigo"
  | "amber"
  | "orange"
  | "rose"
  | "sky"
  | "violet";

const ACCENT_STYLES: Record<
  Accent,
  { box: string; label: string; value: string; dot: string }
> = {
  emerald: {
    box: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/80 dark:border-emerald-500/25 dark:from-emerald-500/10 dark:to-teal-500/5",
    label: "text-emerald-700/80 dark:text-emerald-300/80",
    value: "text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  blue: {
    box: "border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50/80 dark:border-blue-500/25 dark:from-blue-500/10 dark:to-indigo-500/5",
    label: "text-blue-700/80 dark:text-blue-300/80",
    value: "text-blue-800 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  indigo: {
    box: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-violet-50/70 dark:border-indigo-500/25 dark:from-indigo-500/10 dark:to-violet-500/5",
    label: "text-indigo-700/80 dark:text-indigo-300/80",
    value: "text-indigo-800 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
  amber: {
    box: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-yellow-50/70 dark:border-amber-500/25 dark:from-amber-500/10 dark:to-yellow-500/5",
    label: "text-amber-700/80 dark:text-amber-300/80",
    value: "text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  orange: {
    box: "border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/70 dark:border-orange-500/25 dark:from-orange-500/10 dark:to-amber-500/5",
    label: "text-orange-700/80 dark:text-orange-300/80",
    value: "text-orange-800 dark:text-orange-200",
    dot: "bg-orange-500",
  },
  rose: {
    box: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/70 dark:border-rose-500/25 dark:from-rose-500/10 dark:to-red-500/5",
    label: "text-rose-700/80 dark:text-rose-300/80",
    value: "text-rose-800 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  sky: {
    box: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-cyan-50/70 dark:border-sky-500/25 dark:from-sky-500/10 dark:to-cyan-500/5",
    label: "text-sky-700/80 dark:text-sky-300/80",
    value: "text-sky-800 dark:text-sky-200",
    dot: "bg-sky-500",
  },
  violet: {
    box: "border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50/70 dark:border-violet-500/25 dark:from-violet-500/10 dark:to-purple-500/5",
    label: "text-violet-700/80 dark:text-violet-300/80",
    value: "text-violet-800 dark:text-violet-200",
    dot: "bg-violet-500",
  },
};

const SECTION_THEMES: Record<
  string,
  { accent: Accent; icon: typeof CloudRain }
> = {
  "Weather Impact": { accent: "sky", icon: CloudRain },
  "Stadium & Travel": { accent: "violet", icon: MapPin },
  "Lineup Impact": { accent: "amber", icon: Users },
  "Base Analysis": { accent: "emerald", icon: TrendingUp },
};

export function PredictionResultCard({ result }: { result: PredictionResult }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-lg shadow-emerald-500/5 dark:border-zinc-700/60 dark:bg-zinc-900/90 dark:shadow-emerald-500/10">
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600" />

      <div className="border-b border-zinc-100 bg-gradient-to-r from-emerald-50/80 via-white to-blue-50/80 px-6 py-4 dark:border-zinc-800 dark:from-emerald-500/10 dark:via-zinc-900 dark:to-blue-500/10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Prediction Results
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {homeLabel} vs {awayLabel}
            </p>
          </div>
          {result.mode === "compare" && (
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
              Hypothetical match
            </span>
          )}
          {result.entityType === "national" && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
              National teams
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 p-6">
        <WinProbabilityBar
          home={result.homeWinPct}
          draw={result.drawPct}
          away={result.awayWinPct}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <StatBox
            label={`${homeLabel} xG`}
            value={result.expectedGoals.home.toFixed(2)}
            accent="emerald"
          />
          <StatBox
            label={`${awayLabel} xG`}
            value={result.expectedGoals.away.toFixed(2)}
            accent="blue"
          />
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
              <Target className="h-3.5 w-3.5" />
            </span>
            Estimated Match Stats
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label="Corners"
              value={String(result.estimated.corners)}
              accent="indigo"
              small
            />
            <StatBox
              label="Fouls"
              value={String(result.estimated.fouls)}
              accent="orange"
              small
            />
            <StatBox
              label="Yellow Cards"
              value={String(result.estimated.yellowCards)}
              accent="amber"
              small
            />
            <StatBox
              label="Red Cards"
              value={String(result.estimated.redCards)}
              accent="rose"
              small
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center justify-between rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3 text-sm font-medium text-violet-900 transition hover:from-violet-100 hover:to-indigo-100 dark:border-violet-500/30 dark:from-violet-500/10 dark:to-indigo-500/10 dark:text-violet-100 dark:hover:from-violet-500/15 dark:hover:to-indigo-500/15"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:bg-violet-400/20 dark:text-violet-300">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              Analysis Breakdown
            </span>
            {showExplanation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showExplanation && <AnalysisBreakdown explanation={result.explanation} />}
        </div>
      </div>
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
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-700/60 dark:bg-zinc-800/40">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Win probability
      </p>
      <div className="flex h-9 overflow-hidden rounded-full shadow-inner shadow-zinc-900/10 ring-1 ring-zinc-200/80 dark:ring-zinc-700/60">
        <div
          className="flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-semibold text-white"
          style={{ width: `${home}%` }}
        >
          {home >= 12 ? `${home}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-gradient-to-r from-zinc-300 to-zinc-400 text-xs font-semibold text-zinc-800 dark:from-zinc-500 dark:to-zinc-600 dark:text-white"
          style={{ width: `${draw}%` }}
        >
          {draw >= 12 ? `${draw}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-gradient-to-r from-blue-500 to-indigo-600 text-xs font-semibold text-white"
          style={{ width: `${away}%` }}
        >
          {away >= 12 ? `${away}%` : ""}
        </div>
      </div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate font-medium text-emerald-700 dark:text-emerald-300">
          {homeLabel} {home}%
        </span>
        <span className="shrink-0 font-medium text-zinc-600 dark:text-zinc-300">Draw {draw}%</span>
        <span className="truncate text-right font-medium text-blue-700 dark:text-blue-300">
          {awayLabel} {away}%
        </span>
      </div>
    </div>
  );
}

function parseExplanation(explanation: string): { title: string; lines: string[] }[] {
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of explanation.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else if (line.trim() && current) {
      current.lines.push(line.trim());
    }
  }

  if (current) sections.push(current);
  return sections;
}

function AnalysisBreakdown({ explanation }: { explanation: string }) {
  const sections = parseExplanation(explanation);

  if (sections.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
        {explanation}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {sections.map((section) => {
        const theme = SECTION_THEMES[section.title] ?? {
          accent: "indigo" as Accent,
          icon: TrendingUp,
        };
        const styles = ACCENT_STYLES[theme.accent];
        const Icon = theme.icon;

        return (
          <section
            key={section.title}
            className={`rounded-xl border p-4 ${styles.box}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 dark:bg-white/10 ${styles.label}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <h4 className={`text-sm font-semibold ${styles.value}`}>{section.title}</h4>
            </div>
            <ul className="space-y-2">
              {section.lines.map((line) => (
                <li
                  key={`${section.title}-${line}`}
                  className="flex gap-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatBox({
  label,
  value,
  accent = "emerald",
  small,
}: {
  label: string;
  value: string;
  accent?: Accent;
  small?: boolean;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`rounded-xl border ${styles.box} ${small ? "p-3" : "p-4"}`}
    >
      <p className={`truncate text-xs font-medium ${styles.label}`}>{label}</p>
      <p className={`font-semibold ${styles.value} ${small ? "text-lg" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

function teamNamesFromSnapshot(snapshot: unknown): {
  homeTeamName?: string;
  awayTeamName?: string;
} {
  if (!snapshot || typeof snapshot !== "object") return {};
  const s = snapshot as Record<string, unknown>;
  return {
    homeTeamName:
      typeof s.homeTeamName === "string" && s.homeTeamName.trim()
        ? s.homeTeamName.trim()
        : undefined,
    awayTeamName:
      typeof s.awayTeamName === "string" && s.awayTeamName.trim()
        ? s.awayTeamName.trim()
        : undefined,
  };
}

export function PredictionResultDisplay({
  result,
}: {
  result: {
    home_win_pct: number;
    away_win_pct: number;
    draw_pct: number;
    home_xg: number;
    away_xg: number;
    estimated_corners: number;
    estimated_fouls: number;
    estimated_yellow_cards: number;
    estimated_red_cards: number;
    explanation: string;
    inputs_snapshot?: unknown;
  };
}) {
  const { homeTeamName, awayTeamName } = teamNamesFromSnapshot(result.inputs_snapshot);

  return (
    <PredictionResultCard
      result={{
        homeTeamName,
        awayTeamName,
        homeWinPct: Number(result.home_win_pct),
        awayWinPct: Number(result.away_win_pct),
        drawPct: Number(result.draw_pct),
        expectedGoals: { home: Number(result.home_xg), away: Number(result.away_xg) },
        estimated: {
          corners: Number(result.estimated_corners),
          fouls: Number(result.estimated_fouls),
          yellowCards: Number(result.estimated_yellow_cards),
          redCards: Number(result.estimated_red_cards),
        },
        explanation: result.explanation,
      }}
    />
  );
}
