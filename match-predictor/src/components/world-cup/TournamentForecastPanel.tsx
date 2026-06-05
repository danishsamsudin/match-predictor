import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import { TournamentBracketGrid } from "@/components/world-cup/TournamentBracketGrid";
import type { TournamentForecastPayload } from "@/lib/world-cup/tournament-forecast-payload";

const ROUND_LABELS: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  "3P": "Third place",
  F: "Final",
};

function TeamBadge({ name, label }: { name: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <NationalTeamFlag teamName={name} side="home" className="h-6 w-6 shrink-0" />
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{name}</p>
        {label && <p className="text-[10px] text-slate-500">{label}</p>}
      </div>
    </div>
  );
}

function McProbBadge({ pct }: { pct: number }) {
  if (pct < 0.5) return null;
  return (
    <span className="ml-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
      {pct.toFixed(1)}% win
    </span>
  );
}

export function TournamentForecastPanel({
  forecast,
}: {
  forecast: TournamentForecastPayload | null;
}) {
  if (!forecast || forecast.knockoutMatches.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Bracket forecast is loading or could not be computed — check that World Cup group
          fixtures are imported. The grid below shows the layout; teams fill in once the model
          run completes.
        </p>
        <TournamentBracketGrid matches={[]} placeholder />
      </div>
    );
  }

  const mcByTeam = new Map(
    (forecast.monteCarlo?.teams ?? []).map((t) => [t.teamId, t])
  );

  const rounds = ["R32", "R16", "QF", "SF", "3P", "F"] as const;
  const byRound = rounds.map((round) => ({
    round,
    label: ROUND_LABELS[round],
    matches: forecast.knockoutMatches.filter((m) => m.round === round),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          Knockout progression
        </h3>
        <TournamentBracketGrid matches={forecast.knockoutMatches} />
      </div>

      <div className="liquid-glass-pill grid gap-4 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Predicted champion
          </p>
          <TeamBadge name={forecast.champion.teamName} />
          <McProbBadge pct={mcByTeam.get(forecast.champion.teamId)?.winPct ?? 0} />
        </div>
        <div className="rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Runner-up
          </p>
          <TeamBadge name={forecast.runnerUp.teamName} />
        </div>
        <div className="rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Third place
          </p>
          <TeamBadge name={forecast.thirdPlace.teamName} />
        </div>
        <div className="rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Finalists
          </p>
          <ul className="space-y-2">
            {forecast.semiFinalists.map((t) => (
              <li key={t.teamId}>
                <TeamBadge name={t.teamName} />
                {mcByTeam.get(t.teamId)?.finalPct != null && mcByTeam.get(t.teamId)!.finalPct >= 1 && (
                  <span className="text-[10px] text-slate-500">
                    {mcByTeam.get(t.teamId)!.finalPct.toFixed(1)}% to reach final
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {forecast.monteCarlo && (
        <details className="liquid-glass-pill rounded-2xl px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
            Win probabilities ({forecast.monteCarlo.iterations.toLocaleString()} simulations)
          </summary>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
            {forecast.monteCarlo.teams
              .filter((t) => t.winPct >= 0.5)
              .slice(0, 16)
              .map((t) => (
                <li
                  key={t.teamId}
                  className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-500/5"
                >
                  <span>{t.teamName}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-400">
                    {t.winPct.toFixed(1)}% win · {t.finalPct.toFixed(1)}% final ·{" "}
                    {t.semiPct.toFixed(1)}% SF
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      <details className="liquid-glass-pill rounded-2xl px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
          Match list by round
        </summary>
        <div className="mt-3 space-y-4">
          {byRound.map(
            ({ round, label, matches }) =>
              matches.length > 0 && (
                <div key={round}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </h4>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {matches.map((m) => (
                      <li
                        key={m.matchNumber}
                        className="rounded-lg border border-slate-200/60 px-3 py-2 text-sm dark:border-slate-700/60"
                      >
                        <span
                          className={
                            m.winner.teamId === m.homeTeam.teamId
                              ? "font-bold text-slate-900 dark:text-white"
                              : "text-slate-600 dark:text-slate-400"
                          }
                        >
                          {m.homeTeam.teamName}
                        </span>
                        <span className="mx-1.5 tabular-nums text-slate-500">
                          {m.homeGoals}-{m.awayGoals}
                        </span>
                        <span
                          className={
                            m.winner.teamId === m.awayTeam.teamId
                              ? "font-bold text-slate-900 dark:text-white"
                              : "text-slate-600 dark:text-slate-400"
                          }
                        >
                          {m.awayTeam.teamName}
                        </span>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          M{m.matchNumber}
                          {m.city ? ` · ${m.city}` : ""}
                          {m.decidedBy && m.decidedBy !== "regulation"
                            ? ` · ${m.decidedBy.replace("_", " ")}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}
        </div>
      </details>

      <p className="text-[10px] text-slate-500">
        Allocation key: {forecast.allocationKey ?? "—"} · Updated{" "}
        {new Date(forecast.computedAt).toLocaleString()}
      </p>
    </div>
  );
}
