"use client";

export function MatchBridge({
  competition,
  homeName,
  awayName,
  showFixtureAction,
  onOpenFixture,
  fixtureSummary,
  compact,
}: {
  competition?: string;
  homeName?: string;
  awayName?: string;
  showFixtureAction?: boolean;
  onOpenFixture?: () => void;
  fixtureSummary?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center text-center ${compact ? "w-full" : "max-w-[12rem] sm:max-w-none"}`}
    >
      {competition && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
          {competition}
        </span>
      )}
      <h2
        className={`mt-1 font-bold text-slate-800 dark:text-slate-200 ${compact ? "text-base" : "text-sm sm:text-lg md:text-xl"}`}
      >
        <span className="block truncate sm:inline">{homeName ?? "Home"}</span>
        <span className="mx-1 font-medium text-slate-400 dark:text-slate-600">vs</span>
        <span className="block truncate sm:inline">{awayName ?? "Away"}</span>
      </h2>
      {showFixtureAction && onOpenFixture && (
        <button
          type="button"
          onClick={onOpenFixture}
          className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-400 dark:hover:bg-slate-800"
        >
          {fixtureSummary ? "Change fixture" : "Find a match"}
        </button>
      )}
      {fixtureSummary && (
        <p className="mt-2 line-clamp-2 max-w-full text-[10px] text-slate-500 dark:text-slate-500">
          {fixtureSummary}
        </p>
      )}
    </div>
  );
}
