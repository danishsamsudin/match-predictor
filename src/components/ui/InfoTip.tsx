"use client";

import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

export function InfoTip({
  label,
  children,
  side = "top",
  size = "md",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  size?: "sm" | "md";
}) {
  const buttonClass =
    size === "sm"
      ? "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-white/5"
      : "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-white/5";
  const iconClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <Tooltip label={label} content={children} side={side}>
      <button type="button" aria-label={label} className={buttonClass}>
        <Info className={iconClass} aria-hidden />
      </button>
    </Tooltip>
  );
}
