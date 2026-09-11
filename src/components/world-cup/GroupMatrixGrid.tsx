import type { GroupStandingRow } from "@/lib/world-cup/standings";

type ThirdPlaceInfo = {
  teamId: string;
  wildcard_rank: number;
  will_advance: boolean;
};

export function GroupMatrixGrid({
  groupMatrix,
  thirdPlaceByTeamId,
}: {
  groupMatrix: Record<string, GroupStandingRow[]>;
  thirdPlaceByTeamId: Map<string, ThirdPlaceInfo>;
}) {
  const codes = Object.keys(groupMatrix).sort();

  return (
    <>
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-1 rounded-sm bg-emerald-500/70" aria-hidden />
        <span>Top two - qualify for the Round of 32</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-1 rounded-sm bg-amber-500/50" aria-hidden />
        <span>Third place - only the best eight third-placed teams advance</span>
      </li>
    </ul>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {codes.map((code) => (
        <div
          key={code}
          className="liquid-glass-pill min-w-0 overflow-hidden rounded-2xl px-3 py-3 sm:px-4"
        >
          <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">
            Group {code}
          </h3>
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
                {groupMatrix[code]?.map((row) => {
                  const isTop2 = row.rank <= 2;
                  const isThird = row.rank === 3;
                  const wild = thirdPlaceByTeamId.get(row.teamId);
                  return (
                    <tr
                      key={row.teamId}
                      className={
                        isTop2
                          ? "border-l-2 border-emerald-500/60 bg-emerald-500/5"
                          : isThird
                            ? "border-l-2 border-amber-500/40"
                            : ""
                      }
                    >
                      <td className="py-1.5 pr-2 align-top font-medium">{row.rank}</td>
                      <td className="min-w-0 py-1.5 pr-2">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                          {row.teamName}
                        </span>
                        {isThird && wild && (
                          <span
                            title={
                              wild.will_advance
                                ? `Ranked ${wild.wildcard_rank} among all 12 third-placed teams - advances to Round of 32`
                                : `Ranked ${wild.wildcard_rank} among third-placed teams - does not make the best-eight cut`
                            }
                            className={`mt-1 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              wild.will_advance
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                            }`}
                          >
                            {wild.will_advance
                              ? `R32 (${wild.wildcard_rank}${ordinalSuffix(wild.wildcard_rank)}/12)`
                              : `Out (${wild.wildcard_rank}${ordinalSuffix(wild.wildcard_rank)}/12)`}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.points}</td>
                      <td className="py-1.5 text-right tabular-nums">
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
      ))}
    </div>
    </>
  );
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
