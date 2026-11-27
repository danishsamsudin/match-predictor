import { PageShell } from "@/components/layout/PageShell";

export default function HomeLoading() {
  return (
    <PageShell>
      <div className="space-y-4 border-b border-glass-border pb-8">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/50" />
        <div className="h-10 w-56 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/50" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-200/60 dark:bg-slate-700/40" />
      </div>
      <div className="mt-8 liquid-glass-panel space-y-4 rounded-2xl p-5">
        <div className="h-6 w-36 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/50" />
        <div className="h-24 w-full animate-pulse rounded bg-slate-200/60 dark:bg-slate-700/40" />
      </div>
    </PageShell>
  );
}
