import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { LANDING_HEADLINE, LANDING_SUPPORT } from "@/lib/marketing/copy";

export function MarketingHero() {
  return (
    <section className="marketing-hero relative overflow-hidden rounded-[2rem] px-6 py-14 sm:px-10 sm:py-20">
      <div className="marketing-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="page-hero-eyebrow text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
          Dynamic match intelligence
        </p>
        <h1 className="mt-4 flex justify-center">
          <BrandLogo size="hero" />
        </h1>
        <p className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {LANDING_HEADLINE}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
          {LANDING_SUPPORT}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="chromatic-cta rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
          >
            Join waitlist
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-glass-border bg-surface px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-hover"
          >
            Sign in
          </Link>
        </div>
        <DisclaimerBanner className="mx-auto mt-8 max-w-xl text-left sm:text-center" />
      </div>
    </section>
  );
}
