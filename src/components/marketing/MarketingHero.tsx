import { BrandLogo } from "@/components/BrandLogo";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { LANDING_HEADLINE, LANDING_SUPPORT } from "@/lib/marketing/copy";

export function MarketingHero() {
  return (
    <section className="marketing-hero relative min-w-0 max-w-full overflow-hidden rounded-[1.5rem] px-4 py-10 sm:rounded-[2rem] sm:px-10 sm:py-20">
      <div className="marketing-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="page-hero-eyebrow text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
          Dynamic match intelligence
        </p>
        <h1 className="mt-4 flex justify-center">
          <BrandLogo size="hero" />
        </h1>
        <p className="mt-6 text-lg font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          {LANDING_HEADLINE}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
          {LANDING_SUPPORT}
        </p>
        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <MarketingCta href="/signup" className="w-full sm:w-auto">
            Request beta access
          </MarketingCta>
          <MarketingCta href="/login" variant="secondary" className="w-full sm:w-auto">
            Sign in
          </MarketingCta>
        </div>
        <DisclaimerBanner className="mx-auto mt-8 max-w-xl text-left sm:text-center" />
      </div>
    </section>
  );
}
