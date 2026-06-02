"use client";

import { AlertTriangle, Info } from "lucide-react";

type BannerItem = {
  id: string;
  variant: "warning" | "info";
  message: React.ReactNode;
};

export function SystemBanner({ items }: { items: BannerItem[] }) {
  if (!items.length) return null;

  return (
    <div className="mx-auto mt-6 flex w-full max-w-6xl flex-col gap-2 px-4 sm:px-0">
      {items.map((item) => {
        const Icon = item.variant === "warning" ? AlertTriangle : Info;
        return (
          <div
            key={item.id}
            className={`system-banner flex items-start gap-3 px-4 py-3 text-sm ${
              item.variant === "warning"
                ? "border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"
                : "border border-indigo-500/20 bg-indigo-500/8 text-indigo-900 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-50"
            }`}
            role="status"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <div className="min-w-0 flex-1">{item.message}</div>
          </div>
        );
      })}
    </div>
  );
}
