"use client";

import { useCallback, useMemo, useState } from "react";
import type { FixtureLineup } from "@/lib/types/football";
import type { PredictionResult } from "@/lib/types/prediction";
import type { SquadPlayer, TeamComparisonSnapshot } from "@/lib/types/team-comparison";

const POS_MAP: Record<string, string> = {
  GK: "G",
  DEF: "D",
  MID: "M",
  FWD: "F",
};

function squadToLineup(
  teamId: number,
  teamName: string,
  formation: string | null,
  starters: SquadPlayer[],
  benchedIds: Set<number>
): FixtureLineup {
  const active = starters.filter((p) => !benchedIds.has(p.sofascorePlayerId));
  return {
    team: { id: teamId, name: teamName },
    formation: formation ?? "4-3-3",
    startXI: active.map((p, i) => ({
      player: {
        id: p.sofascorePlayerId,
        name: p.name,
        number: i + 1,
        pos: POS_MAP[p.position] ?? "M",
        grid: null,
        performanceScore: p.performanceScore ?? undefined,
      },
    })),
    substitutes: starters
      .filter((p) => benchedIds.has(p.sofascorePlayerId))
      .map((p, i) => ({
        player: {
          id: p.sofascorePlayerId,
          name: p.name,
          number: 20 + i,
          pos: POS_MAP[p.position] ?? "M",
          grid: null,
          performanceScore: p.performanceScore ?? undefined,
        },
      })),
  };
}

function buildLineupsFromComparison(
  snapshot: TeamComparisonSnapshot,
  homeBenched: Set<number>,
  awayBenched: Set<number>
): FixtureLineup[] {
  const lineups: FixtureLineup[] = [];
  const home = snapshot.home.squad;
  const away = snapshot.away.squad;
  if (home.hasLineupData && home.starters.length) {
    lineups.push(
      squadToLineup(
        snapshot.home.teamId,
        snapshot.home.teamName,
        home.preferredFormation,
        home.starters,
        homeBenched
      )
    );
  }
  if (away.hasLineupData && away.starters.length) {
    lineups.push(
      squadToLineup(
        snapshot.away.teamId,
        snapshot.away.teamName,
        away.preferredFormation,
        away.starters,
        awayBenched
      )
    );
  }
  return lineups;
}

export function LineupWhatIfEditor({
  result,
  onRerun,
  loading,
}: {
  result: PredictionResult;
  onRerun: (customLineups: FixtureLineup[]) => void;
  loading?: boolean;
}) {
  const snapshot = result.teamComparison;
  const [homeBenched, setHomeBenched] = useState<Set<number>>(() => new Set());
  const [awayBenched, setAwayBenched] = useState<Set<number>>(() => new Set());

  const canEdit = useMemo(() => {
    if (!snapshot) return false;
    return (
      snapshot.home.squad.hasLineupData ||
      snapshot.away.squad.hasLineupData
    );
  }, [snapshot]);

  const toggleBenched = useCallback(
    (side: "home" | "away", playerId: number) => {
      if (side === "home") {
        setHomeBenched((prev) => {
          const next = new Set(prev);
          if (next.has(playerId)) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
      } else {
        setAwayBenched((prev) => {
          const next = new Set(prev);
          if (next.has(playerId)) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
      }
    },
    []
  );

  if (!canEdit || !snapshot) return null;

  const applyWhatIf = () => {
    const lineups = buildLineupsFromComparison(snapshot, homeBenched, awayBenched);
    if (lineups.length) onRerun(lineups);
  };

  const reset = () => {
    setHomeBenched(new Set());
    setAwayBenched(new Set());
  };

  const renderSide = (
    side: "home" | "away",
    label: string,
    starters: SquadPlayer[],
    benched: Set<number>
  ) => (
    <div key={side}>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
      <ul className="mt-2 space-y-1">
        {starters.map((p) => (
          <li key={p.sofascorePlayerId} className="flex items-center justify-between gap-2 text-xs">
            <span className={benched.has(p.sofascorePlayerId) ? "line-through opacity-50" : ""}>
              {p.name} ({p.position})
            </span>
            <button
              type="button"
              onClick={() => toggleBenched(side, p.sofascorePlayerId)}
              className="rounded-md border px-2 py-0.5 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {benched.has(p.sofascorePlayerId) ? "Restore" : "Bench"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
        What-if lineup
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Bench starters to re-run the model with a custom XI (LAV + discrete rules).
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {snapshot.home.squad.starters.length > 0 &&
          renderSide(
            "home",
            result.homeTeamName ?? "Home",
            snapshot.home.squad.starters,
            homeBenched
          )}
        {snapshot.away.squad.starters.length > 0 &&
          renderSide(
            "away",
            result.awayTeamName ?? "Away",
            snapshot.away.squad.starters,
            awayBenched
          )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || (!homeBenched.size && !awayBenched.size)}
          onClick={applyWhatIf}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Running…" : "Re-run with custom lineup"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border px-3 py-1.5 text-xs"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
