import type { ReactNode } from "react";

export function WorldCupSectionHelp({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-4 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-400 ${className}`}
    >
      {title ? (
        <p className="mb-1 font-semibold text-slate-800 dark:text-slate-200">{title}</p>
      ) : null}
      <div className="space-y-1 text-xs leading-relaxed sm:text-sm">{children}</div>
    </div>
  );
}
