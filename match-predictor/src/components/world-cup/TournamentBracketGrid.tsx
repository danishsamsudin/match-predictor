"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import { buildBracketMatchPredictorUrl } from "@/lib/world-cup/predictor-prefill";
import type { ForecastMatchResult } from "@/lib/world-cup/tournament-simulation";
import {
  BRACKET_COL_WIDTH,
  BRACKET_COLUMN_LABELS,
  BRACKET_DISPLAY_FEEDS,
  colCenterX,
  BRACKET_FINAL_BAR_HEIGHT,
  BRACKET_FINAL_BAR_WIDTH,
  BRACKET_GRID_SLOTS,
  BRACKET_MATCH_BAR_HEIGHT,
  BRACKET_MATCH_BAR_WIDTH,
  bracketGridHeight,
  bracketGridWidth,
  getBracketScrollAnchors,
  getBracketSlot,
  matchBarLeft,
  matchBarRight,
  matchBlockHeight,
  resolveBracketScrollSegment,
  slotCenterY,
  type BracketScrollSegment,
  type BracketSide,
} from "@/lib/world-cup/tournament-bracket-layout";

const MOBILE_BREAKPOINT_PX = 768;

function BracketMatchLink({
  match,
  clickable,
  children,
  className = "",
}: {
  match: ForecastMatchResult;
  clickable: boolean;
  children: ReactNode;
  className?: string;
}) {
  const href = clickable ? buildBracketMatchPredictorUrl(match) : null;

  if (!href) {
    return <div className={className}>{children}</div>;
  }

  const label = `${match.homeTeam.teamName} vs ${match.awayTeam.teamName}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded transition hover:ring-2 hover:ring-cyan-500/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${className}`}
      aria-label={`Open ${label} in predictor`}
      title={`Open ${label} in predictor (new tab)`}
    >
      {children}
    </a>
  );
}

function TeamLine({
  teamName,
  goals,
  isWinner,
  align = "left",
  placeholder,
  compact,
}: {
  teamName: string;
  goals: number;
  isWinner: boolean;
  align?: "left" | "right";
  placeholder?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {!placeholder && (
        <NationalTeamFlag
          teamName={teamName}
          side="home"
          className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0`}
        />
      )}
      <span
        className={`min-w-0 flex-1 ${compact ? "text-[11px]" : "text-[12px]"} leading-tight ${
          align === "right" ? "text-right" : "text-left"
        } ${
          isWinner
            ? "font-semibold text-slate-900 dark:text-white"
            : placeholder
              ? "text-slate-400"
              : "text-slate-600 dark:text-slate-300"
        }`}
        title={teamName}
      >
        {teamName}
      </span>
      {!placeholder && (
        <span
          className={`w-5 shrink-0 text-center ${compact ? "text-[11px]" : "text-[12px]"} tabular-nums text-slate-400`}
        >
          {goals}
        </span>
      )}
    </div>
  );
}

function MatchBar({
  match,
  side,
  placeholder,
  clickable = false,
  width = BRACKET_MATCH_BAR_WIDTH,
  height = BRACKET_MATCH_BAR_HEIGHT,
}: {
  match: ForecastMatchResult;
  side: BracketSide;
  placeholder?: boolean;
  clickable?: boolean;
  width?: number;
  height?: number;
}) {
  const homeWins = !placeholder && match.winner.teamId === match.homeTeam.teamId;
  const awayWins = !placeholder && match.winner.teamId === match.awayTeam.teamId;

  const bar = (
    <div
      className={`flex flex-col justify-center overflow-hidden rounded border px-2 py-1 ${
        placeholder
          ? "border-dashed border-slate-300/50 bg-slate-500/5 dark:border-slate-600/35"
          : clickable
            ? "cursor-pointer border-slate-200/80 bg-white/70 dark:border-slate-600/55 dark:bg-slate-900/55"
            : "border-slate-200/80 bg-white/70 dark:border-slate-600/55 dark:bg-slate-900/55"
      }`}
      style={{ width, height }}
    >
      <TeamLine
        teamName={match.homeTeam.teamName}
        goals={match.homeGoals}
        isWinner={homeWins}
        align={side === "right" ? "right" : "left"}
        placeholder={placeholder}
        compact
      />
      <div className="my-0.5 border-t border-slate-200/50 dark:border-slate-600/40" />
      <TeamLine
        teamName={match.awayTeam.teamName}
        goals={match.awayGoals}
        isWinner={awayWins}
        align={side === "right" ? "right" : "left"}
        placeholder={placeholder}
        compact
      />
    </div>
  );

  return (
    <BracketMatchLink match={match} clickable={clickable && !placeholder} className="block">
      {bar}
    </BracketMatchLink>
  );
}

function FinalBlock({
  match,
  placeholder,
  clickable = false,
}: {
  match: ForecastMatchResult;
  placeholder?: boolean;
  clickable?: boolean;
}) {
  const homeWins = !placeholder && match.winner.teamId === match.homeTeam.teamId;
  const champion = homeWins ? match.homeTeam : match.awayTeam;
  const runnerUp = homeWins ? match.awayTeam : match.homeTeam;
  const championGoals = homeWins ? match.homeGoals : match.awayGoals;
  const runnerUpGoals = homeWins ? match.awayGoals : match.homeGoals;

  const block = (
    <div
      className={`flex w-full flex-1 flex-col justify-center rounded-lg border-2 px-3 py-2 ${
        placeholder
          ? "border-dashed border-slate-300/50 bg-slate-500/5"
          : clickable
            ? "cursor-pointer border-amber-400/55 bg-amber-500/10 dark:border-amber-400/45"
            : "border-amber-400/55 bg-amber-500/10 dark:border-amber-400/45"
      }`}
    >
      <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
        Champion
      </p>
      <TeamLine
        teamName={champion.teamName}
        goals={championGoals}
        isWinner
        placeholder={placeholder}
      />
      <div className="my-2 border-t border-amber-400/25" />
      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-widest text-slate-400">
        Runner-up
      </p>
      <TeamLine
        teamName={runnerUp.teamName}
        goals={runnerUpGoals}
        isWinner={false}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: BRACKET_FINAL_BAR_WIDTH, height: BRACKET_FINAL_BAR_HEIGHT }}
    >
      <BracketMatchLink
        match={match}
        clickable={clickable && !placeholder}
        className="flex h-full w-full flex-col"
      >
        {block}
      </BracketMatchLink>
    </div>
  );
}

function ThirdPlaceBar({
  match,
  placeholder,
  clickable = false,
}: {
  match: ForecastMatchResult;
  placeholder?: boolean;
  clickable?: boolean;
}) {
  return (
    <div className="flex flex-col items-center" style={{ width: BRACKET_FINAL_BAR_WIDTH }}>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
        3rd place
      </p>
      <MatchBar
        match={match}
        side="center"
        placeholder={placeholder}
        clickable={clickable}
        width={BRACKET_FINAL_BAR_WIDTH}
        height={BRACKET_MATCH_BAR_HEIGHT}
      />
    </div>
  );
}

function BracketConnectors({ hasData }: { hasData: boolean }) {
  const gridWidth = bracketGridWidth();
  const gridHeight = bracketGridHeight();
  const paths: string[] = [];

  for (const [parentStr, feeders] of Object.entries(BRACKET_DISPLAY_FEEDS)) {
    const parentNum = Number(parentStr);
    if (parentNum === 103) continue;

    const parentSlot = getBracketSlot(parentNum);
    if (!parentSlot) continue;

    const parentY = slotCenterY(parentSlot);
    const parentSide = parentSlot.side;
    const parentLeft = matchBarLeft(parentSlot);
    const parentRight = matchBarRight(parentSlot);

    for (const feederNum of feeders) {
      const feederSlot = getBracketSlot(feederNum);
      if (!feederSlot) continue;

      const feederY = slotCenterY(feederSlot);
      const feederSide = feederSlot.side;

      if (parentSide === "center" && feederSide === "left") {
        const x1 = matchBarRight(feederSlot);
        const x2 = parentLeft;
        const midX = x1 + (x2 - x1) * 0.55;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      } else if (parentSide === "center" && feederSide === "right") {
        const x1 = matchBarLeft(feederSlot);
        const x2 = parentRight;
        const midX = x1 - (x1 - x2) * 0.55;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      } else if (feederSide === "left" && parentSide === "left") {
        const x1 = matchBarRight(feederSlot);
        const x2 = parentLeft;
        const midX = x1 + (x2 - x1) * 0.5;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      } else if (feederSide === "right" && parentSide === "right") {
        const x1 = matchBarLeft(feederSlot);
        const x2 = parentRight;
        const midX = x1 - (x1 - x2) * 0.5;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      } else if (feederSide === "right" && parentSide === "left") {
        const x1 = matchBarLeft(feederSlot);
        const x2 = parentRight;
        const midX = (x1 + x2) / 2;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      } else if (feederSide === "left" && parentSide === "right") {
        const x1 = matchBarRight(feederSlot);
        const x2 = parentLeft;
        const midX = (x1 + x2) / 2;
        paths.push(`M ${x1} ${feederY} H ${midX} V ${parentY} H ${x2}`);
      }
    }
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={gridWidth}
      height={gridHeight}
      viewBox={`0 0 ${gridWidth} ${gridHeight}`}
      aria-hidden
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="text-slate-300 dark:text-slate-600"
          opacity={hasData ? 0.9 : 0.35}
        />
      ))}
    </svg>
  );
}

const MOBILE_SEGMENTS: { id: BracketScrollSegment; label: string }[] = [
  { id: "left", label: "Left bracket" },
  { id: "final", label: "Final" },
  { id: "right", label: "Right bracket" },
];

function BracketMobileNav({
  active,
  onSelect,
}: {
  active: BracketScrollSegment;
  onSelect: (segment: BracketScrollSegment) => void;
}) {
  return (
    <div
      className="mb-3 flex gap-1.5 md:hidden"
      role="tablist"
      aria-label="Bracket sections"
    >
      {MOBILE_SEGMENTS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(id)}
            className={`wc-bracket-segment rounded-full px-3 py-2 text-center text-[11px] font-semibold transition-colors ${
              isActive
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-500/10 text-slate-600 hover:bg-slate-500/15 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function buildPlaceholderMatches(): ForecastMatchResult[] {
  return BRACKET_GRID_SLOTS.map((slot) => ({
    matchNumber: slot.matchNumber,
    round:
      slot.matchNumber === 104
        ? "F"
        : slot.matchNumber === 103
          ? "3P"
          : slot.matchNumber >= 101
            ? "SF"
            : slot.matchNumber >= 97
              ? "QF"
              : slot.matchNumber >= 89
                ? "R16"
                : "R32",
    date: null,
    kickoffTime: null,
    city: null,
    homeTeam: { teamId: `ph-${slot.matchNumber}-h`, teamName: "TBD" },
    awayTeam: { teamId: `ph-${slot.matchNumber}-a`, teamName: "TBD" },
    homeGoals: 0,
    awayGoals: 0,
    winner: { teamId: `ph-${slot.matchNumber}-h`, teamName: "TBD" },
  }));
}

export function TournamentBracketGrid({
  matches,
  placeholder = false,
}: {
  matches: ForecastMatchResult[];
  placeholder?: boolean;
}) {
  const hasData = !placeholder && matches.length > 0;
  const displayMatches = hasData ? matches : buildPlaceholderMatches();
  const matchesByNumber = new Map(displayMatches.map((m) => [m.matchNumber, m]));
  const gridWidth = bracketGridWidth();
  const gridHeight = bracketGridHeight();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSegment, setActiveSegment] = useState<BracketScrollSegment>("final");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const didAutoScroll = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { clientWidth, scrollLeft, scrollWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);

    if (clientWidth < MOBILE_BREAKPOINT_PX) {
      setActiveSegment(resolveBracketScrollSegment(scrollLeft, clientWidth));
    }
  }, []);

  const scrollToSegment = useCallback((segment: BracketScrollSegment) => {
    const el = scrollRef.current;
    if (!el) return;

    const anchors = getBracketScrollAnchors(el.clientWidth);
    el.scrollTo({ left: anchors[segment], behavior: "smooth" });
    setActiveSegment(segment);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);

    const applyLayout = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      updateScrollState();

      if (mobile && !didAutoScroll.current) {
        const anchors = getBracketScrollAnchors(el.clientWidth);
        el.scrollTo({ left: anchors.final, behavior: "auto" });
        didAutoScroll.current = true;
        setActiveSegment("final");
      }
    };

    applyLayout();
    mq.addEventListener("change", applyLayout);

    const ro = new ResizeObserver(applyLayout);
    ro.observe(el);

    return () => {
      mq.removeEventListener("change", applyLayout);
      ro.disconnect();
    };
  }, [updateScrollState]);

  return (
    <div className="liquid-glass-pill overflow-hidden rounded-2xl p-3 sm:p-4">
      <BracketMobileNav active={activeSegment} onSelect={scrollToSegment} />

      <div className="wc-bracket-root">
        {isMobile && canScrollLeft && <div className="wc-bracket-fade-left" aria-hidden />}
        {isMobile && canScrollRight && <div className="wc-bracket-fade-right" aria-hidden />}

        <div
          ref={scrollRef}
          className="wc-bracket-scroll -mx-1 overflow-x-auto px-1 pb-1"
          onScroll={updateScrollState}
        >
          <div style={{ width: gridWidth, minWidth: "100%" }}>
            <div className="relative mb-3" style={{ width: gridWidth, height: 14 }}>
              {BRACKET_COLUMN_LABELS.map((col, colIndex) => (
                <p
                  key={col.key}
                  className="absolute top-0 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                  style={{
                    left: colCenterX(colIndex),
                    width: BRACKET_COL_WIDTH,
                    transform: "translateX(-50%)",
                  }}
                >
                  {col.label}
                </p>
              ))}
            </div>

            <div className="relative" style={{ width: gridWidth, height: gridHeight }}>
              <BracketConnectors hasData={hasData} />

              {BRACKET_GRID_SLOTS.map((slot) => {
                const match = matchesByNumber.get(slot.matchNumber);
                if (!match) return null;

                const isFinal = match.round === "F";
                const isThird = match.round === "3P";
                const blockHeight = matchBlockHeight(slot.matchNumber);
                const left = matchBarLeft(slot);
                const blockWidth =
                  isFinal || isThird ? BRACKET_FINAL_BAR_WIDTH : BRACKET_MATCH_BAR_WIDTH;

                return (
                  <div
                    key={slot.matchNumber}
                    className="absolute z-[1]"
                    style={{
                      left,
                      top: slot.y - blockHeight / 2,
                      width: blockWidth,
                    }}
                  >
                  {isFinal ? (
                    <FinalBlock match={match} placeholder={!hasData} clickable={hasData} />
                  ) : isThird ? (
                    <ThirdPlaceBar match={match} placeholder={!hasData} clickable={hasData} />
                  ) : (
                    <MatchBar
                      match={match}
                      side={slot.side}
                      placeholder={!hasData}
                      clickable={hasData}
                    />
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-500 md:hidden">
        {hasData
          ? "Tap a match to open full stats in Predict · Swipe or use tabs above · Bold = winner"
          : "Swipe sideways to explore the bracket layout"}
      </p>
      <p className="mt-2 hidden text-center text-[10px] text-slate-500 md:block">
        {hasData
          ? "Click any match to open full predictor stats in a new tab · Bold = predicted winner"
          : "Bracket layout · teams appear when group predictions are available"}
      </p>
    </div>
  );
}
