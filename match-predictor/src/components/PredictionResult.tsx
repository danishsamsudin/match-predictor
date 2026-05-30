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

type Accent = "primary" | "accent" | "neutral";

const ACCENT_STYLES: Record<
  Accent,
  { box: string; label: string; value: string; dot: string; icon: string }
> = {
  primary: {
    box: "border-primary/20 bg-primary/5",
    label: "text-primary-emphasis",
    value: "text-primary",
    dot: "bg-primary",
    icon: "bg-primary/15 text-primary-emphasis",
  },
  accent: {
    box: "border-accent/20 bg-accent/5",
    label: "text-accent-emphasis",
    value: "text-accent",
    dot: "bg-accent",
    icon: "bg-accent/15 text-accent-emphasis",
  },
  neutral: {
    box: "border-glass-border bg-surface",
    label: "text-muted",
    value: "text-foreground",
    dot: "bg-muted",
    icon: "bg-foreground/5 text-muted",
  },
};

const SECTION_THEMES: Record<
  string,
  { accent: Accent; icon: typeof CloudRain }
> = {
  "Weather Impact": { accent: "primary", icon: CloudRain },
  "Stadium & Travel": { accent: "accent", icon: MapPin },
  "Lineup Impact": { accent: "accent", icon: Users },
  "Base Analysis": { accent: "primary", icon: TrendingUp },
};

export function PredictionResultCard({ result }: { result: PredictionResult }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";

  return (
    <div className="overflow-hidden rounded-2xl glass glow-primary">
      <div className="h-0.5 bg-gradient-to-r from-primary via-primary-light to-accent" />

      <div className="border-b border-glass-border px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-gradient shadow-lg shadow-primary/25">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Prediction Results</h2>
            <p className="text-xs text-muted">
              {homeLabel} vs {awayLabel}
            </p>
          </div>
          {result.mode === "compare" && (
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent-emphasis">
              Hypothetical match
            </span>
          )}
          {result.entityType === "national" && (
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary-emphasis">
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
            accent="primary"
          />
          <StatBox
            label={`${awayLabel} xG`}
            value={result.expectedGoals.away.toFixed(2)}
            accent="accent"
          />
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
              <Target className="h-3.5 w-3.5" />
            </span>
            Estimated Match Stats
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Corners" value={String(result.estimated.corners)} accent="primary" small />
            <StatBox label="Fouls" value={String(result.estimated.fouls)} accent="neutral" small />
            <StatBox label="Yellow Cards" value={String(result.estimated.yellowCards)} accent="accent" small />
            <StatBox label="Red Cards" value={String(result.estimated.redCards)} accent="neutral" small />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center justify-between rounded-xl glass-subtle px-4 py-3 text-sm font-medium transition hover:bg-primary/5"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-emphasis">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              Analysis Breakdown
            </span>
            {showExplanation ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
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
    <div className="space-y-3 rounded-xl glass-subtle p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Win probability
      </p>
      <div className="flex h-9 overflow-hidden rounded-full ring-1 ring-glass-border">
        <div
          className="flex items-center justify-center bg-gradient-to-r from-primary to-primary-light text-xs font-semibold text-on-primary"
          style={{ width: `${home}%` }}
        >
          {home >= 12 ? `${home}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-foreground/10 text-xs font-semibold text-muted"
          style={{ width: `${draw}%` }}
        >
          {draw >= 12 ? `${draw}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-gradient-to-r from-accent to-accent-light text-xs font-semibold text-on-accent"
          style={{ width: `${away}%` }}
        >
          {away >= 12 ? `${away}%` : ""}
        </div>
      </div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate font-medium text-primary">
          {homeLabel} {home}%
        </span>
        <span className="shrink-0 font-medium text-muted">Draw {draw}%</span>
        <span className="truncate text-right font-medium text-accent">
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
      <p className="mt-3 rounded-xl glass-subtle p-4 text-sm text-muted">
        {explanation}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {sections.map((section) => {
        const theme = SECTION_THEMES[section.title] ?? {
          accent: "neutral" as Accent,
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
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${styles.icon}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <h4 className={`text-sm font-semibold ${styles.value}`}>{section.title}</h4>
            </div>
            <ul className="space-y-2">
              {section.lines.map((line) => (
                <li
                  key={`${section.title}-${line}`}
                  className="flex gap-2.5 text-sm leading-relaxed text-muted"
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
  accent = "primary",
  small,
}: {
  label: string;
  value: string;
  accent?: Accent;
  small?: boolean;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className={`rounded-xl border ${styles.box} ${small ? "p-3" : "p-4"}`}>
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
