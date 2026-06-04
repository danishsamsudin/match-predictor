"use client";

import { useState } from "react";
import { resolveNationalFlagUrl } from "@/lib/data/team-logos";
function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

export function NationalTeamFlag({
  teamName,
  side,
  className = "wc-team-flag",
}: {
  teamName: string;
  side: "home" | "away";
  className?: string;
}) {
  const src = resolveNationalFlagUrl(teamName);
  const [broken, setBroken] = useState(false);
  const initials = teamInitials(teamName);

  if (!src || broken) {
    return (
      <div
        className={`wc-team-flag-fallback ${side === "home" ? "wc-team-flag-fallback-home" : "wc-team-flag-fallback-away"} ${className}`}
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
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}
