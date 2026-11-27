import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { LeaguePerformanceTable } from "@/components/marketing/LeaguePerformanceTable";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { PricingCards } from "@/components/marketing/PricingCards";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import {
  COVERAGE_LEAGUES,
  DATA_STACK_TEASER,
  LANDING_PROOF_PRIMARY,
  LANDING_PROOF_SECONDARY,
} from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: `${BRAND_NAME} - Dynamic match intelligence`,
  description:
    "Research win probabilities, expected goals, fair odds, and Value Opportunities across Premier League, Eredivisie, Serie A, Bundesliga, and Championship.",
  alternates: { canonical: "/" },
};

export const revalidate = 3600;

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
      <MarketingHero />

      <section
        className="marketing-reveal marketing-reveal-delay-1 mt-10 sm:mt-14"
        aria-labelledby="coverage-heading"
      >
        <h2 id="coverage-heading" className="sr-only">
          League coverage
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {COVERAGE_LEAGUES.map((league) => (
            <span
              key={league}
              className="glass-chip rounded-full px-3 py-1.5 text-xs font-semibold text-foreground sm:px-4 sm:py-2 sm:text-sm"
            >
              {league}
            </span>
          ))}
        </div>
      </section>

      <section className="marketing-reveal marketing-reveal-delay-2 mt-12 sm:mt-16">
        <SectionHeading
          eyebrow="Product"
          title="Research cards built for how you price games."
          description="Probabilities, fair odds, and Value Opportunities in one workflow - without tipster theatrics."
        />
        <div className="mt-6 sm:mt-8">
          <ProductPreview />
        </div>
      </section>

      <section className="marketing-reveal mt-12 sm:mt-16">
        <SectionHeading
          eyebrow="Performance"
          title="League model reliability."
          description={`${LANDING_PROOF_PRIMARY} ${LANDING_PROOF_SECONDARY}`}
        />
        <LeaguePerformanceTable />
      </section>

      <section className="mt-12 sm:mt-16">
        <SectionHeading
          eyebrow="Data"
          title="Where the numbers come from."
          description="We combine match feeds, odds, xG overlays, and weather so every card sits on transparent inputs."
        />
        <ul className="mt-6 grid gap-5 sm:mt-8 sm:grid-cols-2 sm:gap-6">
          {DATA_STACK_TEASER.map((item) => (
            <li key={item.name} className="border-l-2 border-primary/40 pl-4">
              <h3 className="text-base font-bold text-foreground">{item.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm">
          <Link
            href="/sources"
            className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
          >
            Full data sources →
          </Link>
        </p>
      </section>

      <section className="mt-12 sm:mt-16">
        <SectionHeading
          eyebrow="Pricing"
          title="Beta access. Monthly or annual."
          description="Pulse, Edge, and Oracle - request access, get approved, then research. No free plan."
        />
        <div className="mt-6 sm:mt-8">
          <PricingCards />
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Prefer details first?{" "}
          <Link href="/pricing" className="font-semibold text-primary hover:underline">
            Open pricing
          </Link>
          .
        </p>
      </section>

      <section className="mt-12 border-t border-glass-border pt-10 text-center sm:mt-16 sm:pt-12">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Request beta access
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Sign up, wait for approval, then sign in. Access is invite-gated while we scale the
          five-league research platform.
        </p>
        <div className="mt-6 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <MarketingCta href="/signup" className="w-full sm:w-auto">
            Request beta access
          </MarketingCta>
          <MarketingCta href="/login" variant="secondary" className="w-full sm:w-auto">
            Sign in
          </MarketingCta>
        </div>
        <DisclaimerBanner className="mx-auto mt-8 max-w-xl text-left sm:text-center" />
      </section>
    </div>
  );
}
