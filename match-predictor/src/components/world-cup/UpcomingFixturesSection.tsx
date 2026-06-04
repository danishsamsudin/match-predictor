"use client";

import { UpcomingDayCarousel } from "@/components/world-cup/UpcomingDayCarousel";
import type { UpcomingMatchCardProps } from "@/components/world-cup/MatchValueFlipCard";
import { formatWorldCupDayLabel } from "@/lib/world-cup/sort-matches";

function groupByMatchDate(
  matches: UpcomingMatchCardProps[]
): Array<{ date: string; matches: UpcomingMatchCardProps[] }> {
  const groups: Array<{ date: string; matches: UpcomingMatchCardProps[] }> = [];
  for (const m of matches) {
    const day = m.matchDate?.trim() || "unknown";
    const last = groups[groups.length - 1];
    if (last?.date === day) {
      last.matches.push(m);
    } else {
      groups.push({ date: day, matches: [m] });
    }
  }
  return groups;
}

export function UpcomingFixturesSection({
  matches,
}: {
  matches: UpcomingMatchCardProps[];
}) {
  if (matches.length === 0) {
    return <p className="text-sm text-slate-500">No upcoming fixtures in store.</p>;
  }

  const dayGroups = groupByMatchDate(matches);

  return (
    <div className="space-y-10">
      {dayGroups.map((group, index) => (
        <div key={group.date}>
          {index > 0 && (
            <div
              className="mb-8 border-t border-slate-200/60 dark:border-slate-700/60"
              aria-hidden
            />
          )}
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-slate-600 dark:text-slate-300">
            {formatWorldCupDayLabel(group.date)}
          </h3>
          <UpcomingDayCarousel matches={group.matches} />
        </div>
      ))}
    </div>
  );
}
