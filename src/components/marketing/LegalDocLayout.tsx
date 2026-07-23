import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/brand";

type LegalDocLayoutProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  updatedLabel?: string;
};

export function LegalDocLayout({
  eyebrow = "Legal",
  title,
  children,
  updatedLabel = "Template for launch - counsel review recommended before charging money.",
}: LegalDocLayoutProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="page-hero-eyebrow text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      <p className="mt-2 text-xs text-muted">{updatedLabel}</p>
      <div className="liquid-glass-panel mt-8 space-y-5 rounded-2xl p-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:p-8">
        {children}
      </div>
      <p className="mt-6 text-xs text-muted">
        Questions? Contact {BRAND_NAME} at{" "}
        <a
          href="mailto:info@tradelinkinternational.nl"
          className="font-semibold text-indigo-600 dark:text-cyan-400"
        >
          info@tradelinkinternational.nl
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-indigo-600 dark:text-cyan-400">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/disclaimer">Disclaimer</Link>
        <Link href="/">← Back home</Link>
      </div>
    </div>
  );
}
