"use client";

import { useState } from "react";
import Link from "next/link";
import { HomeLeagueTabs } from "@/components/glpm/HomeLeagueTabs";
import type { GlpmStandingRow } from "@/lib/glpm/hub-types";

export type HomeStandingsLeague = {
  leagueName: string;
  competitionId: number | null;
  seasonId: number | null;
  seasonName: string | null;
  rows: GlpmStandingRow[];
};

function FormDots({ form }: { form: GlpmStandingRow["form"] }) {
  if (!form.length) {
    return <span className="text-muted">-</span>;
  }
  return (
    <span className="inline-flex gap-0.5" aria-label={`Form ${form.join(" ")}`}>
      {form.map((r, i) => (
        <span
          key={`${r}-${i}`}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white ${
            r === "W"
              ? "bg-emerald-600"
              : r === "D"
                ? "bg-slate-400 dark:bg-slate-500"
                : "bg-rose-600"
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function RankMovement({ row }: { row: GlpmStandingRow }) {
  const movement = row.rankMovement ?? "new";
  const places = Math.abs(row.rankDelta ?? 0);

  if (movement === "up" && places > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
        aria-label={`Moved up ${places} ${places === 1 ? "place" : "places"}`}
        title={`Up ${places}`}
      >
        <span aria-hidden="true">▲</span>
        <span className="tabular-nums">{places}</span>
      </span>
    );
  }

  if (movement === "down" && places > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
        aria-label={`Moved down ${places} ${places === 1 ? "place" : "places"}`}
        title={`Down ${places}`}
      >
        <span aria-hidden="true">▼</span>
        <span className="tabular-nums">{places}</span>
      </span>
    );
  }

  return <span className="text-[10px] text-muted" aria-hidden="true">-</span>;
}

function StandingsTable({
  rows,
  seasonId,
}: {
  rows: GlpmStandingRow[];
  seasonId: number | null;
}) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted">
        Standings are not available yet. Finished matches will fill this table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-glass-border text-muted">
            <th className="pb-2 pr-2 font-semibold">#</th>
            <th className="pb-2 pr-3 font-semibold">Team</th>
            <th className="pb-2 px-1 text-center font-semibold">P</th>
            <th className="pb-2 px-1 text-center font-semibold">W</th>
            <th className="pb-2 px-1 text-center font-semibold">D</th>
            <th className="pb-2 px-1 text-center font-semibold">L</th>
            <th className="pb-2 px-1 text-center font-semibold">GF</th>
            <th className="pb-2 px-1 text-center font-semibold">GA</th>
            <th className="pb-2 px-1 text-center font-semibold">GD</th>
            <th className="pb-2 px-1 text-center font-semibold">Pts</th>
            <th className="pb-2 pl-2 font-semibold">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const gd =
              row.goalDifference > 0
                ? `+${row.goalDifference}`
                : String(row.goalDifference);
            const compareHref = `/predict?entity=club&mode=compare&home=${row.teamSmId}${
              seasonId != null ? `&seasonId=${seasonId}` : ""
            }`;
            return (
              <tr
                key={row.teamSmId}
                className="border-b border-glass-border/60 last:border-0"
              >
                <td className="py-2 pr-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums text-muted">{row.rank}</span>
                    <RankMovement row={row} />
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Link
                    href={compareHref}
                    className="font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {row.teamName}
                  </Link>
                </td>
                <td className="px-1 py-2 text-center tabular-nums">{row.played}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.won}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.drawn}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.lost}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.goalsFor}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.goalsAgainst}</td>
                <td className="px-1 py-2 text-center tabular-nums">{gd}</td>
                <td className="px-1 py-2 text-center font-semibold tabular-nums">
                  {row.points}
                </td>
                <td className="py-2 pl-2">
                  <FormDots form={row.form} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HomeLeagueStandingsPanel({
  leagues,
}: {
  leagues: HomeStandingsLeague[];
}) {
  const tabs = leagues.map((l) => ({ id: l.leagueName, label: l.leagueName }));
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = leagues.find((l) => l.leagueName === activeId) ?? leagues[0] ?? null;

  return (
    <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-foreground">League Standings</h2>
        {active?.seasonName ? (
          <p className="text-xs text-muted">{active.seasonName}</p>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted">
        Tables from finished matches in the current season. Arrows show movement since the last
        results update. Click a team to open compare.
      </p>

      {tabs.length ? (
        <HomeLeagueTabs
          leagues={tabs}
          activeId={active?.leagueName ?? activeId}
          onSelect={setActiveId}
          ariaLabel="Standings leagues"
        />
      ) : null}

      <div className="mt-4" role="tabpanel">
        {active ? (
          <StandingsTable rows={active.rows} seasonId={active.seasonId} />
        ) : (
          <p className="text-sm text-muted">No standings available yet.</p>
        )}
      </div>
    </div>
  );
}
