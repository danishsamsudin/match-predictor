"use client";

import { useState } from "react";
import { isSquareNationalFlag, resolveNationalFlagUrl } from "@/lib/data/team-logos";

function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

export type NationalTeamFlagSize =
  | "default"
  | "card-sm"
  | "2xs"
  | "xs"
  | "sm"
  | "md"
  | "lg";

const FLAG_SIZE_CLASS: Record<NationalTeamFlagSize, string> = {
  default: "wc-team-flag",
  "card-sm": "wc-team-flag-sm",
  "2xs": "wc-team-flag-2xs",
  xs: "wc-team-flag-xs",
  sm: "wc-team-flag-sm-inline",
  md: "wc-team-flag-md",
  lg: "wc-team-flag-lg",
};

function resolveFlagClassName(
  teamName: string,
  size: NationalTeamFlagSize,
  className?: string
): string {
  const base = FLAG_SIZE_CLASS[size];
  const square = isSquareNationalFlag(teamName) ? `${base}--square` : "";
  return [base, square, className].filter(Boolean).join(" ");
}

export function NationalTeamFlag({
  teamName,
  side,
  size = "default",
  className,
}: {
  teamName: string;
  side: "home" | "away";
  size?: NationalTeamFlagSize;
  className?: string;
}) {
  const src = resolveNationalFlagUrl(teamName);
  const [broken, setBroken] = useState(false);
  const initials = teamInitials(teamName);
  const flagClassName = resolveFlagClassName(teamName, size, className);

  if (!src || broken) {
    return (
      <div
        className={`wc-team-flag-fallback ${side === "home" ? "wc-team-flag-fallback-home" : "wc-team-flag-fallback-away"} ${flagClassName}`}
        aria-hidden
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={flagClassName}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}
