import type { ReactNode } from "react";
import { isGoalLikeKind, type LiveTimelineKind } from "@/lib/glpm/live-scores/event-types";

export function GoalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="currentColor" opacity="0.12" />
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8 4.1 9.55 5.2 9.2 7H6.8l-.35-1.8L8 4.1Zm0 7.8-1.55-1.1.35-1.8h2.4l.35 1.8L8 11.9ZM4.35 6.35l1.7-.35L6.8 7.5 5.6 8.9l-1.55-.55.3-2Zm7.3 0-.3 2-1.55.55L8.6 7.5l.75-1.5 1.7.35ZM5.6 10.55l1.2-1.4h2.4l1.2 1.4-1.05 1.2H6.65L5.6 10.55Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M4.5 3.5v5.2M4.5 3.5 2.8 5.2M4.5 3.5 6.2 5.2M11.5 12.5V7.3M11.5 12.5 9.8 10.8M11.5 12.5 13.2 10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TimelineEventIcon({
  kind,
  onRail = false,
  count,
  size = "md",
}: {
  kind: LiveTimelineKind;
  onRail?: boolean;
  /** When > 1, show a compact count badge (clustered same-minute events). */
  count?: number;
  size?: "sm" | "md";
}) {
  const disc = onRail
    ? "relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 dark:bg-slate-950 dark:ring-white/20"
    : size === "sm"
      ? "relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      : "relative inline-flex h-5 w-5 items-center justify-center";

  const glyphClass = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  let glyph: ReactNode;
  let title = "Event";

  switch (kind) {
    case "goal":
    case "penalty":
    case "pen_shootout_goal":
      title = "Goal";
      glyph = <GoalGlyph className={`${glyphClass} text-emerald-600 dark:text-emerald-400`} />;
      break;
    case "own_goal":
      title = "Own goal";
      glyph = <GoalGlyph className={`${glyphClass} text-slate-600 dark:text-slate-300`} />;
      break;
    case "missed_penalty":
    case "pen_shootout_miss":
      title = "Missed penalty";
      glyph = (
        <span
          className={`${size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full border-2 border-muted`}
        />
      );
      break;
    case "yellow_card":
      title = "Yellow card";
      glyph = (
        <span
          className={`${size === "sm" ? "h-3 w-2" : "h-3.5 w-2.5"} rounded-[2px] bg-amber-400 shadow-sm`}
          aria-hidden
        />
      );
      break;
    case "red_card":
    case "yellow_red_card":
      title = "Red card";
      glyph = (
        <span
          className={`${size === "sm" ? "h-3 w-2" : "h-3.5 w-2.5"} rounded-[2px] bg-rose-600 shadow-sm`}
          aria-hidden
        />
      );
      break;
    case "substitution":
      title = "Substitution";
      glyph = <SubGlyph className={`${glyphClass} text-sky-600 dark:text-sky-400`} />;
      break;
    case "var":
      title = "VAR";
      glyph = (
        <span className="text-[8px] font-bold tracking-wide text-violet-700 dark:text-violet-300">
          VAR
        </span>
      );
      break;
  }

  const badge = count != null && count > 1 ? count : null;
  const badgeTone =
    kind === "substitution"
      ? "bg-sky-600"
      : isGoalLikeKind(kind)
        ? "bg-emerald-600"
        : kind === "yellow_card"
          ? "bg-amber-500"
          : kind === "red_card" || kind === "yellow_red_card"
            ? "bg-rose-600"
            : "bg-slate-600";

  return (
    <span className={disc} title={badge ? `${badge}× ${title}` : title}>
      {glyph}
      {badge ? (
        <span
          className={`absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none text-white shadow-sm ring-1 ring-white dark:ring-slate-950 ${badgeTone}`}
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}
