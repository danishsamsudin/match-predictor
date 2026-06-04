import type { GroupStandingRow, KnockoutProjection } from "@/lib/world-cup/standings";
import { buildRoundOf32Matchups } from "@/lib/world-cup/knockout-display";

export function KnockoutProjectionPanel({
  knockoutProjection,
  groupMatrix,
}: {
  knockoutProjection: KnockoutProjection;
  groupMatrix: Record<string, GroupStandingRow[]>;
}) {
  const matchups = buildRoundOf32Matchups(
    knockoutProjection.slotAssignments,
    groupMatrix
  );

  return (
    <details className="liquid-glass-pill rounded-2xl px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
        Round of 32 projection
        {knockoutProjection.provisional && (
          <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
            (provisional)
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-400">
        <p className="text-sm leading-relaxed">
          This is <strong>not</strong> a DynamixG model prediction of the knockout bracket. It is
          a mechanical projection: if the group stage stopped right now, who would qualify (top
          two plus best eight thirds) and which Annex C draw would apply. As real results come in,
          tables and pairings update automatically.
        </p>
        {knockoutProjection.provisional && (
          <p className="text-amber-700 dark:text-amber-400">
            Marked provisional because not every group-stage match is finished - pairings may
            still shift.
          </p>
        )}
        <p>
          Allocation key:{" "}
          <code className="rounded bg-slate-900/5 px-1 dark:bg-white/10">
            {knockoutProjection.lookupKey ?? "TBD"}
          </code>
          {knockoutProjection.allocationFound
            ? " - which eight groups supply advancing third-placed teams"
            : " - bracket mapping pending"}
        </p>
        {matchups.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {matchups.map((m) => (
              <li
                key={m.slot}
                className="rounded-lg border border-slate-200/60 px-3 py-2 dark:border-slate-700/60"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {m.homeTeam}
                </span>
                <span className="mx-1 text-slate-400">vs</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {m.awayTeam}
                </span>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {m.homeLabel} vs {m.awayLabel}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>Bracket pairings will appear once eight advancing third-place groups are known.</p>
        )}
      </div>
    </details>
  );
}
