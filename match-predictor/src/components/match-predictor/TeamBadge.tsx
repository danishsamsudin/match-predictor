"use client";

import { useEffect, useState } from "react";
import type { EntityType, TeamOption } from "@/lib/types/football-lookup";
import { localTeamLogoPath, resolveTeamLogo } from "@/lib/data/team-logos";
import { teamInitials } from "./utils";

export function TeamBadge({
  team,
  entityType,
  accent = "home",
  className = "h-14 w-14 sm:h-16 sm:w-16",
}: {
  team?: TeamOption;
  entityType?: EntityType;
  accent?: "home" | "away";
  className?: string;
}) {
  const primary = team ? resolveTeamLogo(team, entityType) : "";
  const fallback = team ? localTeamLogoPath(team.id) : "";
  const [src, setSrc] = useState(primary);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setSrc(team ? resolveTeamLogo(team, entityType) : "");
    setBroken(false);
  }, [team?.id, team?.name, entityType, team]);

  const initials = team ? teamInitials(team.name) : "?";
  const badgeBg =
    accent === "home"
      ? "bg-gradient-to-br from-orange-500 to-amber-600 dark:from-cyan-600 dark:to-teal-700"
      : "bg-gradient-to-br from-blue-600 to-indigo-800 dark:from-violet-600 dark:to-fuchsia-800";

  if (!team || broken || !src) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl text-base font-bold text-white shadow-md sm:text-lg ${badgeBg} ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={`rounded-xl object-contain ${className}`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src !== fallback && fallback) {
          setSrc(fallback);
        } else {
          setBroken(true);
        }
      }}
    />
  );
}
