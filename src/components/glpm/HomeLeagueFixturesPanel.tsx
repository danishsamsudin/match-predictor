"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { GlpmUpcomingFlipCard } from "@/components/glpm/GlpmUpcomingFixturesSection";
import { HomeLeagueTabs } from "@/components/glpm/HomeLeagueTabs";
import type { GlpmHubUpcomingMatch } from "@/lib/glpm/hub-types";
import { DISPLAY_LOCALE, formatCalendarDateLongLocal } from "@/lib/utils/kickoff-display";

export type HomeFixturesLeague = {
  leagueName: string;
  competitionId: number | null;
  seasonId: number | null;
  matches: GlpmHubUpcomingMatch[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD. */
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function matchLocalYmd(match: GlpmHubUpcomingMatch): string | null {
  if (match.kickoffAt) {
    const kickoff = new Date(match.kickoffAt);
    if (!Number.isNaN(kickoff.getTime())) return localYmd(kickoff);
  }
  if (match.date) return match.date.slice(0, 10);
  return null;
}

/**
 * First two local calendar days that actually have upcoming matches.
 * Returns fewer than two when the league has fewer match days loaded.
 */
export function upcomingTwoDayWindow(
  matches: GlpmHubUpcomingMatch[],
  now = new Date()
): string[] {
  const today = localYmd(now);
  const days = new Set<string>();
  for (const m of matches) {
    const ymd = matchLocalYmd(m);
    if (!ymd || ymd < today) continue;
    days.add(ymd);
  }
  return [...days].sort().slice(0, 2);
}

function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

function MatchdaySpine({
  day,
  dayTone,
  isFirst,
}: {
  day: string;
  dayTone: 0 | 1;
  isFirst: boolean;
}) {
  const date = parseLocalYmd(day);
  const weekday = date
    .toLocaleDateString(DISPLAY_LOCALE, { weekday: "short" })
    .toUpperCase();
  const dayNum = date.toLocaleDateString(DISPLAY_LOCALE, { day: "numeric" });
  const month = date
    .toLocaleDateString(DISPLAY_LOCALE, { month: "short" })
    .toUpperCase();
  const fullLabel = formatCalendarDateLongLocal(day);

  return (
    <div
      className={`glpm-day-spine glpm-day-tone-${dayTone}`}
      role="separator"
      aria-label={fullLabel}
    >
      <div className="glpm-day-spine-rail glpm-day-spine-rail-top" aria-hidden />
      <div className="glpm-day-spine-board">
        {isFirst ? <span className="glpm-day-spine-tag">Next</span> : null}
        <span className="glpm-day-spine-weekday">{weekday}</span>
        <span className="glpm-day-spine-rule" aria-hidden />
        <span className="glpm-day-spine-date">{dayNum}</span>
        <span className="glpm-day-spine-month">{month}</span>
      </div>
      <div className="glpm-day-spine-rail glpm-day-spine-rail-bottom" aria-hidden />
    </div>
  );
}

export function HomeLeagueFixturesPanel({
  leagues,
}: {
  leagues: HomeFixturesLeague[];
}) {
  const tabs = leagues.map((l) => ({ id: l.leagueName, label: l.leagueName }));
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");

  const active = leagues.find((l) => l.leagueName === activeId) ?? leagues[0] ?? null;

  const dayWindow = useMemo(
    () => (active ? upcomingTwoDayWindow(active.matches) : []),
    [active]
  );

  const byDay = useMemo(() => {
    if (!active) return new Map<string, GlpmHubUpcomingMatch[]>();
    const map = new Map<string, GlpmHubUpcomingMatch[]>();
    for (const day of dayWindow) map.set(day, []);
    for (const m of active.matches) {
      const ymd = matchLocalYmd(m);
      if (!ymd || !map.has(ymd)) continue;
      map.get(ymd)!.push(m);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ka = a.kickoffAt ?? a.date ?? "";
        const kb = b.kickoffAt ?? b.date ?? "";
        return ka.localeCompare(kb);
      });
    }
    return map;
  }, [active, dayWindow]);

  const hubHref =
    active?.competitionId != null
      ? `/league?competitionId=${active.competitionId}${
          active.seasonId != null ? `&seasonId=${active.seasonId}` : ""
        }`
      : "/league";

  return (
    <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-foreground">Upcoming Fixtures</h2>
        <Link href={hubHref} className="text-sm font-semibold text-primary hover:underline">
          View full hub →
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        Scroll sideways through the next two match days. Flip any card for O/U, BTTS, and fair
        odds - day posts mark where the calendar rolls over.
      </p>

      {tabs.length ? (
        <HomeLeagueTabs
          leagues={tabs}
          activeId={active?.leagueName ?? activeId}
          onSelect={setActiveId}
          ariaLabel="Fixture leagues"
        />
      ) : null}

      <div className="mt-4" role="tabpanel">
        {!active ? (
          <p className="text-sm text-muted">No leagues available yet.</p>
        ) : !active.competitionId ? (
          <p className="text-sm text-muted">
            This league is not ready yet. Ingest season data to unlock fixtures.
          </p>
        ) : dayWindow.length === 0 ? (
          <p className="text-sm text-muted">No upcoming fixtures for this league.</p>
        ) : (
          <div className="glpm-fixtures-rail" role="list" aria-label="Upcoming fixtures by match day">
            {dayWindow.map((day, dayIndex) => {
              const matches = byDay.get(day) ?? [];
              const dayTone = (dayIndex === 0 ? 0 : 1) as 0 | 1;
              return (
                <Fragment key={day}>
                  <MatchdaySpine day={day} dayTone={dayTone} isFirst={dayIndex === 0} />
                  {matches.map((m) => (
                    <div
                      key={m.matchSmId}
                      className="glpm-fixtures-rail-slot"
                      role="listitem"
                    >
                      <GlpmUpcomingFlipCard
                        match={m}
                        seasonId={active.seasonId}
                        dayTone={dayTone}
                      />
                    </div>
                  ))}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
