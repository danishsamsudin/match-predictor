import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { PROOF_LEGAL_NOTE } from "@/lib/marketing/copy";
import {
  formatPct,
  getLeaguePerformanceSummary,
  type MarketMetricId,
} from "@/lib/marketing/league-performance";

const COLUMNS: { id: MarketMetricId; label: string }[] = [
  { id: "btts", label: "BTTS" },
  { id: "ou25", label: "O/U 2.5" },
  { id: "oneXTwo", label: "1X2" },
  { id: "dc", label: "DC" },
];

export function LeaguePerformanceTable() {
  const summary = getLeaguePerformanceSummary();

  if (!summary.leagues.length) {
    return (
      <div className="mt-8">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          League reliability baselines are refreshing. Check back shortly, or read how we evaluate
          markets on the methodology page.
        </p>
        <DisclaimerBanner className="mt-6">{PROOF_LEGAL_NOTE}</DisclaimerBanner>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* Mobile / tablet cards */}
      <ul className="space-y-3 md:hidden">
        {summary.leagues.map((league) => (
          <li
            key={league.leagueSmId}
            className="rounded-2xl border border-glass-border bg-surface/40 px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold text-foreground">{league.leagueName}</p>
              <p className="text-xs tabular-nums text-muted">
                {league.matchSampleSize.toLocaleString()} matches
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              {COLUMNS.map((col) => {
                const cell = league.metrics[col.id];
                return (
                  <div
                    key={col.id}
                    className="rounded-xl border border-glass-border/80 px-2 py-2"
                  >
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {col.label}
                    </dt>
                    <dd className="mt-1 text-sm font-bold tabular-nums text-foreground">
                      {cell ? formatPct(cell.hitRate) : "-"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto table-h-scroll md:block">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-glass-border text-[11px] font-semibold uppercase tracking-widest text-muted">
              <th className="py-3 pr-4 font-semibold">League</th>
              {COLUMNS.map((col) => (
                <th key={col.id} className="py-3 pr-4 font-semibold">
                  {col.label} hit
                </th>
              ))}
              <th className="py-3 font-semibold">Matches</th>
            </tr>
          </thead>
          <tbody>
            {summary.leagues.map((league) => (
              <tr
                key={league.leagueSmId}
                className="border-b border-glass-border/70 text-foreground"
              >
                <td className="py-3.5 pr-4 font-semibold">{league.leagueName}</td>
                {COLUMNS.map((col) => {
                  const cell = league.metrics[col.id];
                  return (
                    <td key={col.id} className="py-3.5 pr-4 tabular-nums">
                      {cell ? (
                        <span title={`${cell.lineLabel} · n=${cell.n}`}>
                          {formatPct(cell.hitRate)}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-3.5 tabular-nums text-slate-600 dark:text-slate-400">
                  {league.matchSampleSize.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Figures come from locked GLPM reliability baselines (real settled evaluations), not tipster
        screenshots. BTTS = both teams to score. O/U 2.5 = over 2.5 goals. 1X2 hit = highest of home
        / draw / away. DC hit = highest of 1X / 12 / X2 (the side the model would take). We do not
        publish equations or coefficients.
        {summary.computedAt
          ? ` Baseline computed ${new Date(summary.computedAt).toLocaleDateString()}.`
          : null}
      </p>
      <DisclaimerBanner className="mt-6">
        {PROOF_LEGAL_NOTE}{" "}
        <Link href="/disclaimer" className="font-semibold underline underline-offset-2">
          Full disclaimer
        </Link>
        .
      </DisclaimerBanner>
    </div>
  );
}
