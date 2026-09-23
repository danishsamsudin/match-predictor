import type { GroupStandingRow } from "@/lib/world-cup/standings";
import { leagueTierFromGroupCode } from "@/lib/nations-league/group-draw";

export function NlGroupMatrixGrid({
  groupMatrix,
}: {
  groupMatrix: Record<string, GroupStandingRow[]>;
}) {
  const codes = Object.keys(groupMatrix).sort();
  const tiers = ["A", "B", "C", "D"] as const;

  return (
    <div className="space-y-8">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-sm bg-emerald-500/70" aria-hidden />
          <span>Group leaders - promotion / League A finals path</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-sm bg-rose-500/60" aria-hidden />
          <span>Bottom places - relegation risk (Leagues A–C)</span>
        </li>
      </ul>
      {tiers.map((tier) => {
        const tierCodes = codes.filter((c) => leagueTierFromGroupCode(c) === tier);
        if (!tierCodes.length) return null;
        return (
          <section key={tier}>
            <h3 className="mb-3 text-base font-bold text-slate-900 dark:text-white">
              League {tier}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {tierCodes.map((code) => {
                const rows = groupMatrix[code] ?? [];
                const n = rows.length;
                return (
                  <div
                    key={code}
                    className="liquid-glass-pill min-w-0 overflow-hidden rounded-2xl px-3 py-3 sm:px-4"
                  >
                    <h4 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">
                      Group {code}
                    </h4>
                    <div className="table-h-scroll">
                      <table className="w-full min-w-0 table-fixed text-xs">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="w-6 pb-1">#</th>
                            <th className="pb-1">Team</th>
                            <th className="w-8 pb-1 text-right">Pts</th>
                            <th className="w-8 pb-1 text-right">GD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const isTop = row.rank === 1 || (tier !== "A" && row.rank === 2);
                            const isBottom =
                              tier !== "D" && n > 0 && row.rank >= Math.max(n - 1, 3);
                            return (
                              <tr
                                key={row.teamId}
                                className={
                                  isTop
                                    ? "border-l-2 border-emerald-500/60 bg-emerald-500/5"
                                    : isBottom
                                      ? "border-l-2 border-rose-500/50 bg-rose-500/5"
                                      : ""
                                }
                              >
                                <td className="py-1 text-slate-500">{row.rank}</td>
                                <td className="truncate py-1 font-medium text-slate-800 dark:text-slate-100">
                                  {row.teamName}
                                </td>
                                <td className="py-1 text-right font-semibold">{row.points}</td>
                                <td className="py-1 text-right text-slate-500">
                                  {row.goalDifference > 0 ? "+" : ""}
                                  {row.goalDifference}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
