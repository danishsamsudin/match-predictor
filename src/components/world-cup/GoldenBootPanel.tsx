import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import type { GoldenBootPredictionPayload } from "@/lib/world-cup/golden-boot-prediction";

function rankRowClass(rank: number): string {
  if (rank === 1) {
    return "border-l-4 border-amber-400/70 bg-amber-500/10";
  }
  if (rank === 2) {
    return "border-l-4 border-slate-300/70 bg-slate-200/10 dark:bg-slate-400/10";
  }
  if (rank === 3) {
    return "border-l-4 border-orange-400/60 bg-orange-500/8";
  }
  return "";
}

function rankMedal(rank: number): string | null {
  if (rank === 1) return "Gold";
  if (rank === 2) return "Silver";
  if (rank === 3) return "Bronze";
  return null;
}

function formatGoals(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function GoldenBootPanel({
  predictions,
}: {
  predictions: GoldenBootPredictionPayload | null;
}) {
  if (!predictions || predictions.candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Golden Boot forecast is loading or could not be computed — squad data and a tournament
        bracket forecast are required.
      </p>
    );
  }

  const liveLeader = predictions.liveLeader;

  return (
    <div className="space-y-4">
      {liveLeader && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Live tournament leader:{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {liveLeader.playerName}
          </span>{" "}
          ({liveLeader.goals} goal{liveLeader.goals === 1 ? "" : "s"})
        </p>
      )}

      <div className="liquid-glass-pill overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="px-4 py-2">Pred.</th>
              <th>Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>Scored</th>
              <th>Live</th>
              <th>Projected</th>
              <th>Matches</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {predictions.candidates.map((row) => {
              const medal = rankMedal(row.rank);
              return (
                <tr key={`${row.teamId}-${row.playerName}`} className={rankRowClass(row.rank)}>
                  <td className="px-4 py-2 font-semibold">
                    {row.rank}
                    {medal && (
                      <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {medal}
                      </span>
                    )}
                  </td>
                  <td className="py-2 font-medium text-slate-900 dark:text-white">
                    {row.playerName}
                    {row.isLiveLeader && (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Live lead
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <NationalTeamFlag
                        teamName={row.teamName}
                        side="home"
                        size="sm"
                      />
                      {row.teamName}
                    </span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-slate-300">
                    {row.fieldPosition ?? row.position}
                  </td>
                  <td className="py-2 font-medium">{row.goalsSoFar}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-300">
                    {row.liveTournamentRank != null ? `${row.liveTournamentRank}` : "—"}
                  </td>
                  <td className="py-2 font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatGoals(row.projectedTotalGoals)}
                  </td>
                  <td className="py-2">{row.expectedMatches}</td>
                  <td className="py-2">{row.scoringSharePct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {predictions.frozenAt && (
        <p className="text-xs text-slate-500">
          Predicted top 10 locked {new Date(predictions.frozenAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          . Row order and projections stay fixed; scored and live columns update after each match.
        </p>
      )}

      <details className="liquid-glass-pill rounded-2xl p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">
          How the model works
        </summary>
        <div className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
          <p>
            Each player&apos;s projected total combines goals already scored with an expected share
            of their team&apos;s remaining scoring opportunities. Team goals come from the
            tournament bracket forecast (group xG plus knockout path), adjusted lightly for
            opponent defensive strength.
          </p>
          <p>
            Player share weights goals/xG per 90, position, expected minutes, penalty duty, and
            whether one striker dominates the squad&apos;s scoring.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 pr-3">Player</th>
                <th className="pb-2 pr-3">Quality</th>
                <th className="pb-2 pr-3">Team att.</th>
                <th className="pb-2 pr-3">Path</th>
                <th className="pb-2 pr-3">Opp. ease</th>
                <th className="pb-2 pr-3">Minutes</th>
                <th className="pb-2">Penalties</th>
              </tr>
            </thead>
            <tbody>
              {predictions.candidates.map((row) => (
                <tr key={`factors-${row.teamId}-${row.playerName}`} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1 pr-3 font-medium">{row.playerName}</td>
                  <td className="py-1 pr-3">{row.factors.playerQuality}</td>
                  <td className="py-1 pr-3">{row.factors.teamStrength.toFixed(2)}</td>
                  <td className="py-1 pr-3">{row.factors.pathDepth.toFixed(2)}</td>
                  <td className="py-1 pr-3">{row.factors.opponentEase.toFixed(2)}</td>
                  <td className="py-1 pr-3">{row.factors.minutesExpectation.toFixed(2)}</td>
                  <td className="py-1">{row.factors.penaltyRole ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {predictions.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-400">
            {predictions.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
