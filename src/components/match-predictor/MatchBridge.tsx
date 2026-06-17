"use client";

export function MatchBridge({
  competition,
  homeName,
  awayName,
  showFixtureAction,
  onOpenFixture,
  fixtureSummary,
  leagueOnly,
}: {
  competition?: string;
  homeName?: string;
  awayName?: string;
  showFixtureAction?: boolean;
  onOpenFixture?: () => void;
  fixtureSummary?: string;
  /** When true, only render league + fixture controls (names live in MatchTeamsSection). */
  leagueOnly?: boolean;
}) {
  if (leagueOnly) {
    return (
      <div className="flex w-full min-w-0 flex-col items-center gap-3 text-center">
        {competition ? (
          <p className="w-full break-words text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-cyan-300 sm:text-base">
            {competition}
          </p>
        ) : null}
        {showFixtureAction && onOpenFixture ? (
          <button
            type="button"
            onClick={onOpenFixture}
            className="rounded-full border border-slate-200/80 bg-white/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 shadow-sm backdrop-blur-sm transition hover:bg-white/70 dark:border-slate-700/70 dark:bg-slate-900/30 dark:text-cyan-300 dark:hover:bg-slate-800/60"
          >
            {fixtureSummary ? "Change fixture" : "Find a match"}
          </button>
        ) : null}
        {fixtureSummary ? (
          <p className="max-w-2xl break-words text-xs text-slate-500 dark:text-slate-400">
            {fixtureSummary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3 text-center">
      {competition ? (
        <p className="w-full break-words text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-cyan-300 sm:text-base">
          {competition}
        </p>
      ) : null}
      {(homeName || awayName) && (
        <div className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
          <p className="break-words text-base font-bold text-slate-800 dark:text-slate-100 sm:text-right sm:text-lg">
            {homeName ?? "Home"}
          </p>
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            vs
          </span>
          <p className="break-words text-base font-bold text-slate-800 dark:text-slate-100 sm:text-left sm:text-lg">
            {awayName ?? "Away"}
          </p>
        </div>
      )}
      {showFixtureAction && onOpenFixture ? (
        <button
          type="button"
          onClick={onOpenFixture}
          className="rounded-full border border-slate-200/80 bg-white/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 shadow-sm backdrop-blur-sm transition hover:bg-white/70 dark:border-slate-700/70 dark:bg-slate-900/30 dark:text-cyan-300 dark:hover:bg-slate-800/60"
        >
          {fixtureSummary ? "Change fixture" : "Find a match"}
        </button>
      ) : null}
      {fixtureSummary ? (
        <p className="max-w-2xl break-words text-xs text-slate-500 dark:text-slate-400">
          {fixtureSummary}
        </p>
      ) : null}
    </div>
  );
}
