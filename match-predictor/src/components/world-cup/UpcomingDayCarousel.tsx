"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MatchOutcomeStrip } from "@/components/world-cup/MatchOutcomeStrip";
import { MatchValueFlipCard, type UpcomingMatchCardProps } from "./MatchValueFlipCard";

const GAP_PX_DESKTOP = 16;
const GAP_PX_MOBILE = 12;
const MAX_CARD_WIDTH_PX = 300;
const MIN_CARD_WIDTH_PX = 220;
const SWIPE_THRESHOLD_PX = 48;

type CarouselLayout = {
  visibleCards: number;
  peekFraction: number;
  gapPx: number;
  isMobile: boolean;
};

function resolveCarouselLayout(viewportWidth: number): CarouselLayout {
  if (viewportWidth < 640) {
    return { visibleCards: 1, peekFraction: 0.12, gapPx: GAP_PX_MOBILE, isMobile: true };
  }
  if (viewportWidth < 1024) {
    return { visibleCards: 2, peekFraction: 0.28, gapPx: GAP_PX_DESKTOP, isMobile: false };
  }
  return { visibleCards: 3, peekFraction: 0.5, gapPx: GAP_PX_DESKTOP, isMobile: false };
}

function measureSlotWidth(viewportWidth: number, layout: CarouselLayout): number {
  if (viewportWidth <= 0) return 280;
  const gaps = (layout.visibleCards - 1) * layout.gapPx;
  const slot =
    (viewportWidth - gaps) / (layout.visibleCards + layout.peekFraction);
  if (layout.isMobile) {
    return Math.max(260, slot);
  }
  return Math.min(MAX_CARD_WIDTH_PX, Math.max(MIN_CARD_WIDTH_PX, slot));
}

export function UpcomingDayCarousel({ matches }: { matches: UpcomingMatchCardProps[] }) {
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CarouselLayout>(() =>
    resolveCarouselLayout(typeof window !== "undefined" ? window.innerWidth : 1024)
  );
  const [slotPx, setSlotPx] = useState(280);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [matches.length, layout.visibleCards]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const nextLayout = resolveCarouselLayout(width);
      setLayout(nextLayout);
      setSlotPx(measureSlotWidth(width, nextLayout));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxIndex = Math.max(0, matches.length - layout.visibleCards);
  const canPrev = index > 0;
  const canNext = index < maxIndex;

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(maxIndex, i + 1)), [maxIndex]);

  const stepPx = slotPx + layout.gapPx;
  const offsetPx = useMemo(() => {
    if (matches.length <= layout.visibleCards) return 0;
    return -index * stepPx;
  }, [index, layout.visibleCards, matches.length, stepPx]);

  const showNav = matches.length > layout.visibleCards && !layout.isMobile;

  const viewportStyle = useMemo(
    () =>
      ({
        "--wc-slot-px": `${slotPx}px`,
        "--wc-carousel-gap": `${layout.gapPx}px`,
      }) as React.CSSProperties,
    [layout.gapPx, slotPx]
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || matches.length <= layout.visibleCards) return;

      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.25) {
        return;
      }

      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev, layout.visibleCards, matches.length]
  );

  return (
    <div className="wc-carousel-root relative">
      {showNav && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Previous matches"
            className="wc-carousel-nav wc-carousel-nav-prev"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Next matches"
            className="wc-carousel-nav wc-carousel-nav-next"
          >
            <ChevronIcon direction="right" />
          </button>
        </>
      )}

      <div
        ref={viewportRef}
        className={[
          "wc-carousel-viewport",
          layout.isMobile ? "wc-carousel-viewport-mobile" : "px-1 sm:px-10",
          canPrev ? "wc-carousel-mask-left" : "",
          canNext ? "wc-carousel-mask-right" : "",
          layout.isMobile && canNext ? "wc-carousel-mask-right-mobile" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={viewportStyle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="wc-carousel-track"
          style={{ transform: `translate3d(${offsetPx}px, 0, 0)` }}
        >
          {matches.map((m) => (
            <div key={m.matchId} className="wc-match-card-slot">
              <MatchValueFlipCard {...m} />
              <MatchOutcomeStrip
                phase={m.matchPhase}
                homeName={m.homeName}
                awayName={m.awayName}
                homeGoals={m.homeGoals}
                awayGoals={m.awayGoals}
              />
            </div>
          ))}
        </div>
      </div>

      {matches.length > layout.visibleCards && (
        <p className="mt-2 text-center text-[11px] text-slate-500">
          {layout.isMobile ? (
            <>
              {index + 1} of {matches.length}
              {canNext ? " · swipe for more" : ""}
            </>
          ) : (
            <>
              {index + 1}-{Math.min(index + layout.visibleCards, matches.length)} of{" "}
              {matches.length} fixtures
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === "left" ? (
        <path d="M15 6l-6 6 6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}
