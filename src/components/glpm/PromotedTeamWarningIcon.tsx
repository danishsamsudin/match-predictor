"use client";

import { AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

export const PROMOTED_TEAM_WARNING_COPY =
  "Newly promoted - limited prior-season data, so this prediction may be less reliable.";

/**
 * Amber warning for clubs new to the competition while current-season ratings
 * are still thin. Use `title` inside flip-card buttons (no nested controls);
 * use `tooltip` on open surfaces like the predict vs line.
 */
export function PromotedTeamWarningIcon({
  variant = "tooltip",
  className = "",
}: {
  variant?: "tooltip" | "title";
  className?: string;
}) {
  const icon = (
    <AlertTriangle
      className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400"
      aria-hidden
    />
  );

  if (variant === "title") {
    return (
      <span
        className={`inline-flex items-center ${className}`.trim()}
        title={PROMOTED_TEAM_WARNING_COPY}
        aria-label={PROMOTED_TEAM_WARNING_COPY}
      >
        {icon}
      </span>
    );
  }

  return (
    <Tooltip
      label="Newly promoted"
      content={PROMOTED_TEAM_WARNING_COPY}
      side="top"
      clickToPin={false}
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={PROMOTED_TEAM_WARNING_COPY}
        className={`inline-flex cursor-help items-center ${className}`.trim()}
      >
        {icon}
      </span>
    </Tooltip>
  );
}
