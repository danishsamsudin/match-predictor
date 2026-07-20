"use client";

import Link from "next/link";
import type { GlpmHubRatingLeader } from "@/lib/glpm/hub-types";

export function GlpmRatingLeadersGrid({
  leaders,
  seasonId,
}: {
  leaders: GlpmHubRatingLeader[];
  seasonId?: number | null;
}) {
  if (!leaders.length) {
    return (
      <p className="text-sm text-muted">
        No rating vectors for this season yet. Train engines and run{" "}
        <code className="text-xs">glpm:assemble-vectors</code>.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-glass-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-glass-border bg-surface/80 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Team</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">Overall</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">A</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">D</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">GK</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">BU</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">PO</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">PR</th>
            <th className="px-3 py-2.5 font-medium tabular-nums">FR</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((t, i) => (
            <tr
              key={t.teamSmId}
              className="border-b border-white/10 last:border-0 dark:border-slate-800/50"
            >
              <td className="px-3 py-2.5 tabular-nums text-muted">{i + 1}</td>
              <td className="px-3 py-2.5 font-semibold text-foreground">
                <Link
                  href={`/predict?entity=club&mode=compare&home=${t.teamSmId}${seasonId != null ? `&seasonId=${seasonId}` : ""}`}
                  className="hover:underline"
                >
                  {t.teamName}
                </Link>
              </td>
              <td className="px-3 py-2.5 font-semibold tabular-nums text-primary">
                {t.overall.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{t.attack.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.defence.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.goalkeeper.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.buildUp.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.possession.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.pressing.toFixed(0)}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.finishing.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
