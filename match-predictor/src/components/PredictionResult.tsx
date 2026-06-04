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
import { MarketComparisonPanel } from "./MarketComparisonPanel";
import { PredictionCharts } from "./prediction-charts/PredictionCharts";
import { LineupWhatIfEditor } from "./LineupWhatIfEditor";
import { TeamComparisonPanel } from "./TeamComparisonPanel";
import type { FixtureLineup } from "@/lib/types/football";
import { InfoTip } from "./ui/InfoTip";
import {
  getExplanationTip,
  normalizeExplanationText,
} from "@/lib/prediction/explanation-glossary";
import { teamNamesFromSnapshot } from "@/lib/prediction/resolve-team-names";
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

export function PredictionResultCard({
  result,
  onRerunWithLineups,
  loading,
}: {
  result: PredictionResult;
  onRerunWithLineups?: (lineups: FixtureLineup[]) => void;
  loading?: boolean;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const homeLabel = result.homeTeamName ?? "Home";
  const awayLabel = result.awayTeamName ?? "Away";

  return (
    <div className="liquid-glass-panel overflow-x-hidden rounded-[2rem]">
      <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-violet-500 dark:from-cyan-400 dark:via-fuchsia-500 dark:to-violet-400" />

      <div className="border-b border-white/30 px-6 py-4 dark:border-slate-800/60">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-gradient shadow-lg shadow-primary/25">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Prediction Results</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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

        {result.teamComparison ? (
          <TeamComparisonPanel comparison={result.teamComparison} />
        ) : null}

        {onRerunWithLineups ? (
          <LineupWhatIfEditor
            result={result}
            onRerun={onRerunWithLineups}
            loading={loading}
          />
        ) : null}

        {result.firstTeamToScorePct ? (
          <FirstTeamToScoreSection
            fts={result.firstTeamToScorePct}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
          />
        ) : null}

        <PredictionCharts result={result} />
        <MarketComparisonPanel result={result} />

        <div className="grid gap-4 sm:grid-cols-2">
          <StatBox
            label={`${homeLabel} xG`}
            value={result.expectedGoals.home.toFixed(2)}
            accent="primary"
            info={
              <>
                <strong>xG</strong> (“expected goals”) estimates how many goals a team should score
                based on the quality of their chances. \(1.00\) xG roughly means “about one goal
                worth of chances”.
              </>
            }
          />
          <StatBox
            label={`${awayLabel} xG`}
            value={result.expectedGoals.away.toFixed(2)}
            accent="accent"
            info={
              <>
                <strong>xG</strong> (“expected goals”) estimates how many goals a team should score
                based on the quality of their chances. \(1.00\) xG roughly means “about one goal
                worth of chances”.
              </>
            }
          />
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
              <Target className="h-3.5 w-3.5" />
            </span>
            Estimated Match Stats
            <InfoTip label="What are estimated match stats?">
              Extra match events the model estimates (like corners or cards). These are rough
              averages - real matches can vary a lot.
            </InfoTip>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label="Corners"
              value={String(result.estimated.corners)}
              accent="primary"
              small
              info={<>A corner kick happens when the ball goes out past the goal line off a defender.</>}
            />
            <StatBox
              label="Fouls"
              value={String(result.estimated.fouls)}
              accent="neutral"
              small
              info={<>Rule breaks that usually stop play (trips, pushes, handball, etc.).</>}
            />
            <StatBox
              label="Yellow Cards"
              value={String(result.estimated.yellowCards)}
              accent="accent"
              small
              info={<>Warnings from the referee. Two yellow cards for a player becomes a red card.</>}
            />
            <StatBox
              label="Red Cards"
              value={String(result.estimated.redCards)}
              accent="neutral"
              small
              info={<>A player is sent off and their team plays with fewer players.</>}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/30 bg-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/40 dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:bg-slate-800/50"
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

function FirstTeamToScoreSection({
  fts,
  homeLabel,
  awayLabel,
}: {
  fts: { home: number; away: number; none: number };
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <div className="liquid-glass-pill space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          First team to score
        </p>
        <InfoTip label="What is first team to score?">
          The chance that each team scores the <strong>first goal</strong>. “No goal” means the
          model expects a 0–0.
        </InfoTip>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3 dark:border-cyan-400/25">
          <p className="truncate text-xs font-medium text-primary-emphasis">{homeLabel}</p>
          <p className="text-xl font-semibold text-primary">{fts.home}%</p>
        </div>
        <div className="rounded-2xl border border-slate-200/50 bg-white/30 p-3 dark:border-slate-700/50 dark:bg-slate-900/30">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No goal</p>
          <p className="text-xl font-semibold text-slate-900 dark:text-white">{fts.none}%</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 dark:border-fuchsia-400/25">
          <p className="truncate text-xs font-medium text-accent-emphasis">{awayLabel}</p>
          <p className="text-xl font-semibold text-accent">{fts.away}%</p>
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
    <div className="liquid-glass-pill space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Win probability
        </p>
        <InfoTip label="What is win probability?">
          A percentage estimate of each outcome (home win, draw, away win). It&apos;s not a guarantee
          - it&apos;s a best-guess based on the data we have.
        </InfoTip>
      </div>
      <div className="flex h-9 overflow-hidden rounded-full ring-1 ring-white/40 dark:ring-slate-700/60">
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

const VISIBLE_FACTS_PER_SECTION = 3;

function extractMetricChips(text: string): string[] {
  const chips: string[] = [];
  const pct = text.match(/\b\d+(?:\.\d+)?%/g);
  if (pct) chips.push(...pct.slice(0, 4));
  const xg = text.match(/\bxG\b[^.]*\d+(?:\.\d+)?/gi);
  if (xg) chips.push(...xg.slice(0, 2));
  if (/\bΩ\b/.test(text)) chips.push("League strength (Ω)");
  return [...new Set(chips)].slice(0, 5);
}

function AnalysisSectionBody({
  section,
  styles,
}: {
  section: { title: string; lines: string[] };
  styles: (typeof ACCENT_STYLES)[Accent];
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = section.lines.map((line) => normalizeExplanationText(line));
  const visible = expanded ? lines : lines.slice(0, VISIBLE_FACTS_PER_SECTION);
  const bulletLines = visible.filter((line) => line.startsWith("-"));
  const proseLines = visible.filter((line) => !line.startsWith("-"));

  return (
    <div className="space-y-3 border-t border-white/20 px-4 pb-4 pt-3 dark:border-slate-800/50">
      {proseLines.length > 0 ? (
        <p className="text-sm leading-relaxed text-muted">{proseLines.join(" ")}</p>
      ) : null}
      {bulletLines.length > 0 ? (
        <ul className="space-y-2">
          {bulletLines.map((line) => {
            const displayLine = line.replace(/^-\s*/, "");
            const tip = getExplanationTip(section.title, displayLine);
            return (
              <li
                key={`${section.title}-${line}`}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
                <span className="flex min-w-0 flex-1 items-start gap-1.5">
                  <span className="min-w-0 flex-1">{displayLine}</span>
                  {tip ? <InfoTip label={tip.label}>{tip.body}</InfoTip> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {proseLines.length === 0 && bulletLines.length === 0 ? (
        <div className="space-y-2">
          {visible.map((line) => {
            const chips = extractMetricChips(line);
            const tip = getExplanationTip(section.title, line);
            return (
              <div
                key={`${section.title}-${line}`}
                className="rounded-lg bg-white/15 px-3 py-2 dark:bg-slate-900/30"
              >
                <p className="text-sm leading-relaxed text-muted">{line}</p>
                {chips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                {tip ? (
                  <div className="mt-1">
                    <InfoTip label={tip.label}>{tip.body}</InfoTip>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {lines.length > VISIBLE_FACTS_PER_SECTION ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-primary-emphasis hover:underline"
        >
          {expanded
            ? "Show less"
            : `Show ${lines.length - VISIBLE_FACTS_PER_SECTION} more`}
        </button>
      ) : null}
    </div>
  );
}

function AnalysisBreakdown({ explanation }: { explanation: string }) {
  const sections = parseExplanation(explanation);
  const summaryLines = sections
    .flatMap((s) => s.lines.slice(0, 1))
    .map((line) => normalizeExplanationText(line))
    .filter(Boolean)
    .slice(0, 3);

  if (sections.length === 0) {
    return (
      <p className="mt-3 rounded-xl glass-subtle p-4 text-sm text-muted">
        {normalizeExplanationText(explanation)}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {summaryLines.length > 0 ? (
        <div className="rounded-xl border border-white/25 bg-white/15 p-4 dark:border-slate-800/50 dark:bg-slate-900/25">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            At a glance
          </p>
          <ul className="mt-2 space-y-1.5">
            {summaryLines.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sections.map((section, idx) => {
        const theme = SECTION_THEMES[section.title] ?? {
          accent: "neutral" as Accent,
          icon: TrendingUp,
        };
        const styles = ACCENT_STYLES[theme.accent];
        const Icon = theme.icon;
        const defaultOpen = section.title === "Base Analysis" || idx === 0;

        return (
          <details
            key={section.title}
            className={`group rounded-xl border ${styles.box}`}
            open={defaultOpen}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${styles.icon}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <h4 className={`flex-1 text-sm font-semibold ${styles.value}`}>{section.title}</h4>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
            </summary>
            <AnalysisSectionBody section={section} styles={styles} />
          </details>
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
  info,
}: {
  label: string;
  value: string;
  accent?: Accent;
  small?: boolean;
  info?: React.ReactNode;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className={`rounded-2xl border backdrop-blur-sm ${styles.box} ${small ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`min-w-0 truncate text-xs font-medium ${styles.label}`}>{label}</p>
        {info ? <InfoTip label={`What is ${label}?`}>{info}</InfoTip> : null}
      </div>
      <p className={`font-semibold ${styles.value} ${small ? "text-lg" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

export function PredictionResultDisplay({
  result,
  homeTeamName: homeTeamNameProp,
  awayTeamName: awayTeamNameProp,
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
  homeTeamName?: string;
  awayTeamName?: string;
}) {
  const fromSnapshot = teamNamesFromSnapshot(result.inputs_snapshot);

  return (
    <PredictionResultCard
      result={{
        homeTeamName: homeTeamNameProp ?? fromSnapshot.homeTeamName,
        awayTeamName: awayTeamNameProp ?? fromSnapshot.awayTeamName,
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
