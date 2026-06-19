"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import type {
  PlayerPropLine,
  PlayerPropMarket,
  PlayerPropsPayload,
  TeamPlayerPropsSide,
} from "@/lib/prediction/player-props";

const EDGE_HIGHLIGHT = 3;
const STORAGE_PREFIX = "player-props-odds:";

function parseOddsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 1 ? n : null;
}

function computeEdgePct(modelPct: number, bookOdds: number | null): number | null {
  if (bookOdds == null) return null;
  const bookImpliedPct = 100 / bookOdds;
  return modelPct - bookImpliedPct;
}

function rankRowClass(rank: number): string {
  if (rank === 1) return "border-l-4 border-amber-400/70 bg-amber-500/10";
  if (rank === 2) return "border-l-4 border-slate-300/70 bg-slate-200/10 dark:bg-slate-400/10";
  if (rank === 3) return "border-l-4 border-orange-400/60 bg-orange-500/8";
  return "";
}

function oddsStorageKey(
  matchKey: string,
  playerName: string,
  market: PlayerPropMarket
): string {
  return `${STORAGE_PREFIX}${matchKey}:${playerName}:${market}`;
}

function TeamPropsTable({
  side,
  teamLabel,
  market,
  matchKey,
  bookOdds,
  onBookOddsChange,
}: {
  side: TeamPlayerPropsSide;
  teamLabel: string;
  market: PlayerPropMarket;
  matchKey: string;
  bookOdds: Record<string, string>;
  onBookOddsChange: (playerName: string, value: string) => void;
}) {
  const lines: PlayerPropLine[] =
    market === "anytime_scorer" ? side.anytimeScorer : side.goalOrAssist;

  if (!lines.length) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        No {teamLabel} players with enough xG/xA data for this market.
      </p>
    );
  }

  return (
    <div className="liquid-glass-pill overflow-x-auto rounded-2xl">
      <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {teamLabel}
      </p>
      <table className="mt-1 w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="px-4 py-2">#</th>
            <th className="py-2">Player</th>
            <th className="py-2">Pos</th>
            <th className="py-2">Model %</th>
            <th className="py-2">Fair</th>
            <th className="py-2">Book</th>
            <th className="py-2 pr-4">Edge</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row) => {
            const key = oddsStorageKey(matchKey, row.playerName, market);
            const bookValue = bookOdds[key] ?? "";
            const bookParsed = parseOddsInput(bookValue);
            const edge = computeEdgePct(row.probabilityPct, bookParsed);

            return (
              <tr
                key={`${side.teamId}-${row.playerName}-${market}`}
                className={rankRowClass(row.rank)}
              >
                <td className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200">
                  {row.rank}
                </td>
                <td className="py-2 font-medium text-slate-900 dark:text-white">
                  {row.playerName}
                  {row.isPenaltyTaker ? (
                    <span className="ml-1.5 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                      PK
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-slate-600 dark:text-slate-300">
                  {row.fieldPosition ?? row.position}
                </td>
                <td className="py-2 tabular-nums">{row.probabilityPct.toFixed(1)}%</td>
                <td className="py-2 tabular-nums">{row.fairDecimalOdds.toFixed(2)}</td>
                <td className="py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={bookValue}
                    onChange={(e) => onBookOddsChange(key, e.target.value)}
                    placeholder="—"
                    aria-label={`Book odds for ${row.playerName}`}
                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                  />
                </td>
                <td
                  className={`py-2 pr-4 tabular-nums font-semibold ${
                    edge != null && Math.abs(edge) >= EDGE_HIGHLIGHT
                      ? edge > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {edge != null ? `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarketSection({
  title,
  description,
  market,
  payload,
  homeLabel,
  awayLabel,
  matchKey,
}: {
  title: string;
  description: string;
  market: PlayerPropMarket;
  payload: PlayerPropsPayload;
  homeLabel: string;
  awayLabel: string;
  matchKey: string;
}) {
  const [bookOdds, setBookOdds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefix = `${STORAGE_PREFIX}${matchKey}:`;
    const loaded: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(prefix) || !storageKey.endsWith(`:${market}`)) continue;
      const value = localStorage.getItem(storageKey);
      if (value) loaded[storageKey] = value;
    }
    setBookOdds(loaded);
  }, [matchKey, market]);

  const handleBookOddsChange = useCallback((key: string, value: string) => {
    setBookOdds((prev) => ({ ...prev, [key]: value }));
    if (typeof window === "undefined") return;
    if (value.trim()) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }, []);

  const clearFixtureOdds = useCallback(() => {
    if (typeof window === "undefined") return;
    const prefix = `${STORAGE_PREFIX}${matchKey}:`;
    const suffix = `:${market}`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(prefix) && storageKey.endsWith(suffix)) {
        keysToRemove.push(storageKey);
      }
    }
    for (const storageKey of keysToRemove) {
      localStorage.removeItem(storageKey);
    }
    setBookOdds({});
  }, [matchKey, market]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={clearFixtureOdds}
          className="text-[10px] font-medium uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          Clear book odds
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamPropsTable
          side={payload.home}
          teamLabel={homeLabel}
          market={market}
          matchKey={matchKey}
          bookOdds={bookOdds}
          onBookOddsChange={handleBookOddsChange}
        />
        <TeamPropsTable
          side={payload.away}
          teamLabel={awayLabel}
          market={market}
          matchKey={matchKey}
          bookOdds={bookOdds}
          onBookOddsChange={handleBookOddsChange}
        />
      </div>
    </div>
  );
}

export function PlayerPropsPanel({
  props: payload,
  homeLabel,
  awayLabel,
  matchKey,
}: {
  props: PlayerPropsPayload;
  homeLabel: string;
  awayLabel: string;
  matchKey: string;
}) {
  const hasAnyLines = useMemo(
    () =>
      payload.home.anytimeScorer.length > 0 ||
      payload.away.anytimeScorer.length > 0 ||
      payload.home.goalOrAssist.length > 0 ||
      payload.away.goalOrAssist.length > 0,
    [payload]
  );

  if (!hasAnyLines) {
    return (
      <div className="rounded-2xl border border-white/20 bg-white/40 p-4 dark:border-slate-700/60 dark:bg-slate-900/40">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Player goal markets could not be computed — squad xG/xA data is unavailable for this
          fixture.
        </p>
        {payload.warnings.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-xs text-slate-400">
            {payload.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/20 bg-white/40 p-4 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-emphasis">
          <Target className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Player goal markets
        </h3>
        <InfoTip label="How are player goal markets calculated?">
          Bottom-up player xG/xA rates are adjusted for tactical matchup (SCI/SSI on international
          fixtures), normalized to team expected goals, then converted via a zero-inflated Poisson
          model. Enter bookmaker decimal odds to compare model probability vs market implied %.
        </InfoTip>
      </div>

      {payload.warnings.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
          {payload.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 space-y-6">
        <MarketSection
          title="Anytime goalscorer"
          description="Top 5 players most likely to score at least one goal."
          market="anytime_scorer"
          payload={payload}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          matchKey={matchKey}
        />
        <MarketSection
          title="Goal or assist"
          description="Top 5 players most likely to register a goal or an assist."
          market="goal_or_assist"
          payload={payload}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          matchKey={matchKey}
        />
      </div>
    </div>
  );
}
