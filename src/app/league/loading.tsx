export default function LeagueLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-9 w-48 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800"
          />
        ))}
      </div>
      <div className="mb-8 h-10 w-44 max-w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="overflow-hidden rounded-2xl border border-glass-border">
        <div className="h-10 border-b border-glass-border bg-slate-100/80 dark:bg-slate-900/50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 animate-pulse border-b border-glass-border last:border-0 bg-slate-50/80 dark:bg-slate-950/40"
          />
        ))}
      </div>
    </div>
  );
}
