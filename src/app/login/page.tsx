import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Sign in | ${BRAND_NAME}`,
};

export default function LoginPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4.5rem)] w-full max-w-6xl min-w-0 items-center gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2">
      <div className="marketing-hero relative hidden overflow-hidden rounded-[2rem] px-8 py-12 lg:block">
        <div className="marketing-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10">
          <p className="page-hero-eyebrow text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
            Member access
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            Back to the fixtures, lines, and hubs.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Sign in to open the app home, League Hub, and prediction tools. Still waiting on access?
            Join the waitlist - multi-user accounts are next.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Live scores and upcoming league fixtures
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Model lines for 1X2, BTTS, O/U, and more
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Fair odds / +EV compare against your book prices
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Suspense
          fallback={
            <div className="h-64 w-full animate-pulse rounded-2xl bg-white/30 dark:bg-slate-900/30" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
