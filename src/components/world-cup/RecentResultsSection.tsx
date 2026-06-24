"use client";

import { useState } from "react";
import { MatchSummaryPanel } from "@/components/world-cup/MatchSummaryPanel";
import {
  ModelPredictionComparePanel,
  type ModelSquadPredictionCompare,
} from "@/components/world-cup/ModelPredictionComparePanel";
import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import type { WcMatchSummary } from "@/lib/world-cup/match-summary";

function shotsOnTargetFromSummary(summary: WcMatchSummary | null): {
  home: number | null;
  away: number | null;
} {
  const sot = summary?.stats.find((s) => s.key === "sot");
  return { home: sot?.home ?? null, away: sot?.away ?? null };
}

export type RecentResultMatch = {
  matchId: string;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  date: string | null;
  groupCode: string | null;
  summary: WcMatchSummary | null;
  modelSquadPrediction?: {
    computed_at?: string;
    team_prediction?: ModelSquadPredictionCompare["teamPrediction"];
    player_props?: PlayerPropsPayload;
  } | null;
};

export function RecentResultsSection({ matches }: { matches: RecentResultMatch[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (matches.length === 0) return null;

  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const isExpanded = expandedId === m.matchId;
        const hasSummary = m.summary != null;
        const sot = shotsOnTargetFromSummary(m.summary);
        const scoreLabel =
          m.homeGoals != null && m.awayGoals != null
            ? `${m.homeGoals}-${m.awayGoals}`
            : "—";

        return (
          <li key={m.matchId} className="wc-recent-result">
            <button
              type="button"
              className={`wc-recent-result-trigger liquid-glass-pill w-full rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                isExpanded ? "wc-recent-result-trigger-open" : ""
              } ${hasSummary ? "cursor-pointer hover:bg-slate-500/5" : "cursor-default"}`}
              onClick={() => {
                if (!hasSummary) return;
                setExpandedId(isExpanded ? null : m.matchId);
              }}
              aria-expanded={hasSummary ? isExpanded : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex flex-wrap items-center gap-2 font-medium text-slate-900 dark:text-white">
                  <NationalTeamFlag teamName={m.homeName} side="home" size="xs" />
                  <span>{m.homeName}</span>
                  <span className="tabular-nums text-slate-700 dark:text-slate-200">{scoreLabel}</span>
                  <NationalTeamFlag teamName={m.awayName} side="away" size="xs" />
                  <span>{m.awayName}</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  {m.date}
                  {m.groupCode ? ` · Group ${m.groupCode}` : ""}
                  {hasSummary && (
                    <span className="wc-recent-result-chevron" aria-hidden>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  )}
                </span>
              </div>
            </button>
            {isExpanded && m.summary && (
              <div className="wc-recent-result-panel">
                <MatchSummaryPanel
                  homeName={m.homeName}
                  awayName={m.awayName}
                  summary={m.summary}
                />
                {m.modelSquadPrediction?.team_prediction && (
                  <ModelPredictionComparePanel
                    homeName={m.homeName}
                    awayName={m.awayName}
                    compare={{
                      matchId: m.matchId,
                      computedAt: m.modelSquadPrediction.computed_at ?? null,
                      teamPrediction: m.modelSquadPrediction.team_prediction ?? null,
                      playerProps: m.modelSquadPrediction.player_props ?? null,
                      actual: {
                        homeGoals: m.homeGoals,
                        awayGoals: m.awayGoals,
                        homeSot: sot.home,
                        awaySot: sot.away,
                      },
                    }}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
