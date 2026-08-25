export default function LeagueLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-3">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-9 w-72 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="h-10 w-44 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-10 w-52 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-glass-border bg-slate-100/80 dark:bg-slate-900/50"
          />
        ))}
      </div>
    </div>
  );
}
