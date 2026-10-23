"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/Tooltip";
import type { GlpmXgTableRow } from "@/lib/glpm/xg-table";
import { perGame } from "@/lib/glpm/xg-table";

function fmt1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toFixed(1);
}

function fmt2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function DiffCell({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="text-muted">-</span>;
  }
  const sign = value > 0 ? "+" : "";
  const color =
    value > 0.05
      ? "text-emerald-600 dark:text-emerald-400"
      : value < -0.05
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {sign}
      {value.toFixed(1)}
    </span>
  );
}

function ScoreCell({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="text-muted">-</span>;
  }
  const sign = value > 0 ? "+" : "";
  return (
    <span className="font-semibold tabular-nums text-primary">
      {sign}
      {value.toFixed(1)}
    </span>
  );
}

const HEADER_TIPS: Record<string, string> = {
  "#": "Rank by xG Score (highest expected goal difference first).",
  Team: "Club name. Opens Clubs compare for this season.",
  Pos: "Live league table position from finished match results.",
  P: "Matches played in this season (finished fixtures only).",
  GF: "Goals for - actual goals scored this season.",
  xGF: "Expected goals for - chance quality created this season.",
  GA: "Goals against - actual goals conceded this season.",
  xGA: "Expected goals against - chance quality conceded this season.",
  "GF/P": "Goals for per game (GF divided by matches played).",
  "xGF/P": "Expected goals for per game (xGF divided by matches played).",
  "GA/P": "Goals against per game (GA divided by matches played).",
  "xGA/P": "Expected goals against per game (xGA divided by matches played).",
  "xG Score": "xGF minus xGA. Positive means creating more than conceding in chance quality.",
  Diff: "Actual goal difference minus xG Score. Positive means outperforming expected GD; negative means underperforming.",
};

function HeaderTip({
  label,
  className,
}: {
  label: keyof typeof HEADER_TIPS;
  className?: string;
}) {
  const tip = HEADER_TIPS[label];
  return (
    <Tooltip label={label} content={<p>{tip}</p>} side="bottom">
      <button
        type="button"
        className={`cursor-help rounded-md px-0.5 text-left uppercase tracking-wide outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 ${className ?? ""}`}
      >
        {label}
      </button>
    </Tooltip>
  );
}

/** Opaque sticky cell bg so scrolled metrics do not show through. */
const STICKY_BG =
  "bg-[color:var(--background)] dark:bg-[color:var(--background)]";
const STICKY_HEAD_BG = "bg-surface";

const stickyRankClass =
  `sticky left-0 z-20 w-10 min-w-10 max-w-10 ${STICKY_BG}`;
const stickyTeamBase =
  "sticky left-10 z-20 min-w-[7.5rem] max-w-[10rem] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.18)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.45)]";
const stickyRankHeadClass =
  `sticky left-0 z-30 w-10 min-w-10 max-w-10 ${STICKY_HEAD_BG}`;
const stickyTeamHeadClass =
  `sticky left-10 z-30 min-w-[7.5rem] max-w-[10rem] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.18)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.45)] ${STICKY_HEAD_BG}`;

const cellPad = "px-2 py-2.5 sm:px-3";
const spacer = "w-3 min-w-3 max-w-3 border-0 bg-transparent p-0";

/** Soft band behind season totals (GF, xGF, GA, xGA) - no outline */
const totalsBand = "bg-slate-500/[0.05] dark:bg-white/[0.035]";
/** Soft band behind per-game rates */
const rateBand = "bg-primary/[0.04] dark:bg-primary/[0.07]";

export function GlpmXgTable({
  rows,
  seasonId,
}: {
  rows: GlpmXgTableRow[];
  seasonId?: number | null;
}) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted">
        No finished matches for this season yet. Standings and xG will appear once
        results are ingested.
      </p>
    );
  }

  return (
    <div className="table-h-scroll rounded-2xl border border-glass-border">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-glass-border bg-surface text-left text-[11px] text-muted">
            <th className={`${cellPad} font-medium ${stickyRankHeadClass}`}>
              <HeaderTip label="#" />
            </th>
            <th className={`${cellPad} font-medium ${stickyTeamHeadClass}`}>
              <HeaderTip label="Team" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums`}>
              <HeaderTip label="Pos" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums`}>
              <HeaderTip label="P" />
            </th>
            <th aria-hidden className={spacer} />
            <th className={`${cellPad} font-medium tabular-nums ${totalsBand}`}>
              <HeaderTip label="GF" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${totalsBand}`}>
              <HeaderTip label="xGF" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${totalsBand}`}>
              <HeaderTip label="GA" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${totalsBand}`}>
              <HeaderTip label="xGA" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${rateBand}`}>
              <HeaderTip label="GF/P" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${rateBand}`}>
              <HeaderTip label="xGF/P" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${rateBand}`}>
              <HeaderTip label="GA/P" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums ${rateBand}`}>
              <HeaderTip label="xGA/P" />
            </th>
            <th aria-hidden className={spacer} />
            <th className={`${cellPad} font-medium tabular-nums`}>
              <HeaderTip label="xG Score" />
            </th>
            <th className={`${cellPad} font-medium tabular-nums`}>
              <HeaderTip label="Diff" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const xgfP = perGame(row.xgf, row.played);
            const xgaP = perGame(row.xga, row.played);
            const gfP = perGame(row.gf, row.played);
            const gaP = perGame(row.ga, row.played);
            const noXg = row.xgSource === "none";
            const xgRank = i + 1;
            // # > Pos: better table place than xG rank (overperforming). # = Pos: in line.
            const teamBg =
              row.tablePos == null
                ? `${STICKY_BG} text-foreground`
                : xgRank >= row.tablePos
                  ? // # >= Pos: matching or outperforming the table
                    "bg-emerald-500/[0.07] text-foreground dark:bg-emerald-400/[0.08]"
                  : // # < Pos: underperforming vs xG rank
                    "bg-rose-500/[0.07] text-foreground dark:bg-rose-400/[0.08]";

            return (
              <tr
                key={row.teamSmId}
                className="border-b border-white/10 last:border-0 dark:border-slate-800/50"
              >
                <td
                  className={`${cellPad} tabular-nums text-muted ${stickyRankClass}`}
                >
                  {xgRank}
                </td>
                <td
                  className={`${cellPad} font-semibold ${stickyTeamBase} ${teamBg}`}
                >
                  <Link
                    href={`/predict?entity=club&mode=compare&home=${row.teamSmId}${
                      seasonId != null ? `&seasonId=${seasonId}` : ""
                    }`}
                    className="block truncate hover:underline"
                    title={
                      row.tablePos != null
                        ? `${row.teamName} - xG rank ${xgRank}, table Pos ${row.tablePos}`
                        : row.teamName
                    }
                  >
                    {row.teamName}
                  </Link>
                </td>
                <td className={`${cellPad} tabular-nums text-muted`}>
                  {row.tablePos != null ? row.tablePos : "-"}
                </td>
                <td className={`${cellPad} tabular-nums`}>{row.played}</td>
                <td aria-hidden className={spacer} />
                <td className={`${cellPad} tabular-nums ${totalsBand}`}>
                  {row.gf}
                </td>
                <td className={`${cellPad} tabular-nums ${totalsBand}`}>
                  {noXg ? "-" : fmt1(row.xgf)}
                </td>
                <td className={`${cellPad} tabular-nums ${totalsBand}`}>
                  {row.ga}
                </td>
                <td className={`${cellPad} tabular-nums ${totalsBand}`}>
                  {noXg ? "-" : fmt1(row.xga)}
                </td>
                <td className={`${cellPad} tabular-nums text-muted ${rateBand}`}>
                  {fmt2(gfP)}
                </td>
                <td className={`${cellPad} tabular-nums text-muted ${rateBand}`}>
                  {noXg ? "-" : fmt2(xgfP)}
                </td>
                <td className={`${cellPad} tabular-nums text-muted ${rateBand}`}>
                  {fmt2(gaP)}
                </td>
                <td className={`${cellPad} tabular-nums text-muted ${rateBand}`}>
                  {noXg ? "-" : fmt2(xgaP)}
                </td>
                <td aria-hidden className={spacer} />
                <td className={cellPad}>
                  {noXg ? (
                    <span className="text-muted">-</span>
                  ) : (
                    <ScoreCell value={row.xgScore} />
                  )}
                </td>
                <td className={cellPad}>
                  {noXg ? (
                    <span className="text-muted">-</span>
                  ) : (
                    <DiffCell value={row.diff} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
