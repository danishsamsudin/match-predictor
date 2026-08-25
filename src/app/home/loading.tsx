export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="liquid-glass-panel space-y-4 rounded-2xl p-6 sm:rounded-[2rem] sm:p-10">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-12 w-56 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="flex gap-2.5 pt-2">
          <div className="h-10 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-10 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
      <div className="mt-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-glass-border bg-slate-100/80 dark:bg-slate-900/50"
          />
        ))}
      </div>
    </div>
  );
}
