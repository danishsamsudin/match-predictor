import type { ReactNode } from "react";

export interface ExplanationTip {
  label: string;
  body: ReactNode;
}

function matchTip(line: string, tests: Array<{ test: RegExp; tip: ExplanationTip }>): ExplanationTip | null {
  for (const { test, tip } of tests) {
    if (test.test(line)) return tip;
  }
  return null;
}

const BASE_ANALYSIS_TIPS: Array<{ test: RegExp; tip: ExplanationTip }> = [
  {
    test: /league strength/i,
    tip: {
      label: "League strength (Omega)",
      body: (
        <>
          A multiplier that adjusts for how strong each team&apos;s league is compared to others.
          Values above 1.0 mean a stronger competition; the model uses this so a leading team in a
          weaker league is not automatically rated like a top team in the Premier League.
        </>
      ),
    },
  },
  {
    test: /momentum index/i,
    tip: {
      label: "Momentum index",
      body: (
        <>
          A single number combining recent form (35%) and head-to-head history (65%). Recent H2H
          meetings count more, and a team that consistently dominates this opponent pushes the index
          further toward the home side. Higher values suggest the side is trending well going into
          this match. It feeds the baseline goal expectations before weather, travel, and lineup
          adjustments.
        </>
      ),
    },
  },
  {
    test: /form score/i,
    tip: {
      label: "Form score",
      body: (
        <>
          Points from the last few finished matches, scaled to a percentage (wins = 3 pts, draws = 1).
          Recent games are weighted more heavily. 100% means maximum points; 50% is roughly
          mid-table form.
        </>
      ),
    },
  },
  {
    test: /h2h rates/i,
    tip: {
      label: "Head-to-head (H2H) rates",
      body: (
        <>
          How often each outcome happened in recent meetings between these teams, with newer games
          weighted more. When they rarely play, the model leans on form instead of inventing H2H
          signal.
        </>
      ),
    },
  },
  {
    test: /structural baseline xg/i,
    tip: {
      label: "Structural baseline xG",
      body: (
        <>
          Expected goals from form, H2H, and league strength <em>before</em> weather, travel, lineup,
          and other shock adjustments. Think of it as the &quot;raw&quot; attacking outlook.
        </>
      ),
    },
  },
  {
    test: /final xg after all adjustments/i,
    tip: {
      label: "Final xG",
      body: (
        <>
          Expected goals after every adjustment (lineups, weather, stadium/travel, etc.). These
          numbers drive the win/draw/loss probabilities shown above.
        </>
      ),
    },
  },
];

const WEATHER_TIPS: Array<{ test: RegExp; tip: ExplanationTip }> = [
  {
    test: /rain|storm|snow|wind|heat|cold|fog|humid/i,
    tip: {
      label: "Weather impact",
      body: (
        <>
          Match-day conditions can change passing quality, tempo, and fouls. The model applies small
          multipliers to xG and discipline stats when weather is extreme.
        </>
      ),
    },
  },
];

const STADIUM_TIPS: Array<{ test: RegExp; tip: ExplanationTip }> = [
  {
    test: /travel|altitude|km|fatigue|stadium/i,
    tip: {
      label: "Stadium and travel",
      body: (
        <>
          Long away travel or unusual venues can slightly reduce away-side performance or increase
          fouls and cards. Neutral-site games usually have minimal effect.
        </>
      ),
    },
  },
];

const LINEUP_TIPS: Array<{ test: RegExp; tip: ExplanationTip }> = [
  {
    test: /lineup|absence|squad|strength|decay|gk/i,
    tip: {
      label: "Lineup impact",
      body: (
        <>
          Missing key players or weak squad depth lowers attacking xG. Top scorers and goalkeeper
          availability are weighted heavily.
        </>
      ),
    },
  },
];

export function getExplanationTip(sectionTitle: string, line: string): ExplanationTip | null {
  const normalized = line.replace(/\u2014/g, "-");

  if (sectionTitle === "Base Analysis") {
    return matchTip(normalized, BASE_ANALYSIS_TIPS);
  }
  if (sectionTitle === "Weather Impact") {
    return matchTip(normalized, WEATHER_TIPS);
  }
  if (sectionTitle === "Stadium & Travel") {
    return matchTip(normalized, STADIUM_TIPS);
  }
  if (sectionTitle === "Lineup Impact") {
    return matchTip(normalized, LINEUP_TIPS);
  }

  return matchTip(normalized, [
    ...BASE_ANALYSIS_TIPS,
    ...WEATHER_TIPS,
    ...STADIUM_TIPS,
    ...LINEUP_TIPS,
  ]);
}

export function normalizeExplanationText(text: string): string {
  return text.replace(/\u2014/g, "-");
}
