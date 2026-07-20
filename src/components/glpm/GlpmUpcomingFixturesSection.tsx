"use client";

import { useState } from "react";
import Link from "next/link";
import type { GlpmHubUpcomingMatch } from "@/lib/glpm/hub-types";

function buildCompareHref(match: GlpmHubUpcomingMatch, seasonId?: number | null): string {
  const params = new URLSearchParams({
    entity: "club",
    mode: "compare",
    home: String(match.homeTeamSmId),
    away: String(match.awayTeamSmId),
  });
  if (seasonId != null) {
    params.set("seasonId", String(seasonId));
  }
  return `/predict?${params.toString()}`;
}

function FlipCard({
  match,
  seasonId,
}: {
  match: GlpmHubUpcomingMatch;
  seasonId?: number | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const p = match.prediction;

  return (
    <div className="perspective-[1000px] h-[220px] w-full">
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="liquid-glass-panel absolute inset-0 flex flex-col justify-between rounded-2xl p-4 text-left [backface-visibility:hidden]"
        >
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {match.gameweek != null ? `GW ${match.gameweek}` : "Upcoming"}
              {match.date ? ` · ${match.date}` : ""}
            </p>
            <p className="mt-2 text-sm font-bold text-primary">{match.homeName}</p>
            <p className="text-xs text-muted">vs</p>
            <p className="text-sm font-bold text-accent">{match.awayName}</p>
          </div>
          {p ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs tabular-nums">
                <span className="text-primary">{(p.homeWin * 100).toFixed(0)}%</span>
                <span className="text-muted">{(p.draw * 100).toFixed(0)}%</span>
                <span className="text-accent">{(p.awayWin * 100).toFixed(0)}%</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                <div className="bg-primary" style={{ width: `${p.homeWin * 100}%` }} />
                <div className="bg-slate-400" style={{ width: `${p.draw * 100}%` }} />
                <div className="bg-accent" style={{ width: `${p.awayWin * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted">
                Pred xG {p.homeXg.toFixed(2)}–{p.awayXg.toFixed(2)} · tap for markets
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">No rating vectors for this pair yet.</p>
          )}
        </button>

        <div className="liquid-glass-panel absolute inset-0 flex flex-col justify-between rounded-2xl p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">GLPM markets</p>
            {p ? (
              <ul className="mt-3 space-y-1.5 text-sm tabular-nums">
                <li>
                  xG{" "}
                  <strong>
                    {p.homeXg.toFixed(2)}–{p.awayXg.toFixed(2)}
                  </strong>
                </li>
                <li>
                  O/U 2.5 over <strong>{(p.over25 * 100).toFixed(0)}%</strong>
                </li>
                <li>
                  BTTS yes <strong>{(p.bttsYes * 100).toFixed(0)}%</strong>
                </li>
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Prediction unavailable.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="text-xs font-medium text-muted hover:underline"
            >
              Flip back
            </button>
            <Link
              href={buildCompareHref(match, seasonId)}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              Open compare
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlpmUpcomingFixturesSection({
  matches,
  seasonId,
}: {
  matches: GlpmHubUpcomingMatch[];
  seasonId?: number | null;
}) {
  if (!matches.length) {
    return (
      <p className="text-sm text-muted">
        No upcoming fixtures with open scores for this season.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {matches.map((m) => (
        <FlipCard key={m.matchSmId} match={m} seasonId={seasonId} />
      ))}
    </div>
  );
}
