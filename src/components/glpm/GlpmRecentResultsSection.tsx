"use client";

import { useState } from "react";
import Link from "next/link";
import type { GlpmHubRecentMatch } from "@/lib/glpm/hub-types";

function StatBar({
  label,
  home,
  away,
}: {
  label: string;
  home: number | null;
  away: number | null;
}) {
  if (home == null && away == null) return null;
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a || 1;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="tabular-nums text-primary">{home ?? "—"}</span>
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-accent">{away ?? "—"}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
        <div className="bg-primary" style={{ width: `${(h / total) * 100}%` }} />
        <div className="bg-accent" style={{ width: `${(a / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function GlpmRecentResultsSection({
  matches,
  seasonId,
}: {
  matches: GlpmHubRecentMatch[];
  seasonId?: number | null;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!matches.length) {
    return <p className="text-sm text-muted">No finished matches in this season yet.</p>;
  }

  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const open = openId === m.matchSmId;
        return (
          <div
            key={m.matchSmId}
            className="liquid-glass-panel overflow-hidden rounded-2xl"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setOpenId(open ? null : m.matchSmId)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  <span className="text-primary">{m.homeName}</span>
                  <span className="mx-1.5 text-muted">vs</span>
                  <span className="text-accent">{m.awayName}</span>
                </p>
                <p className="text-xs text-muted">{m.date ?? "—"}</p>
              </div>
              <p className="shrink-0 text-lg font-bold tabular-nums">
                {m.homeGoals ?? "–"}–{m.awayGoals ?? "–"}
              </p>
            </button>
            {open ? (
              <div className="space-y-4 border-t border-glass-border px-4 py-4">
                <div className="space-y-2.5">
                  <StatBar
                    label="xG"
                    home={m.homeStats?.xg ?? null}
                    away={m.awayStats?.xg ?? null}
                  />
                  <StatBar
                    label="Shots"
                    home={m.homeStats?.shots ?? null}
                    away={m.awayStats?.shots ?? null}
                  />
                  <StatBar
                    label="SoT"
                    home={m.homeStats?.shotsOnTarget ?? null}
                    away={m.awayStats?.shotsOnTarget ?? null}
                  />
                  <StatBar
                    label="Possession %"
                    home={m.homeStats?.possession ?? null}
                    away={m.awayStats?.possession ?? null}
                  />
                  <StatBar
                    label="PPDA"
                    home={m.homeStats?.ppda ?? null}
                    away={m.awayStats?.ppda ?? null}
                  />
                </div>
                {m.model ? (
                  <div className="rounded-xl bg-surface/80 p-3 text-xs">
                    <p className="mb-1 font-semibold text-foreground">Pre-match GLPM</p>
                    <p className="tabular-nums text-muted">
                      1X2 {(m.model.homeWin * 100).toFixed(0)} /{" "}
                      {(m.model.draw * 100).toFixed(0)} /{" "}
                      {(m.model.awayWin * 100).toFixed(0)}% · xG{" "}
                      {m.model.homeXg.toFixed(2)}–{m.model.awayXg.toFixed(2)}
                    </p>
                  </div>
                ) : null}
                <Link
                  href={`/predict?entity=club&mode=compare&home=${m.homeTeamSmId}&away=${m.awayTeamSmId}${seasonId != null ? `&seasonId=${seasonId}` : ""}`}
                  className="inline-flex text-sm font-semibold text-primary hover:underline"
                >
                  Re-run in predictor →
                </Link>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
