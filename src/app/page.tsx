import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { PricingCards } from "@/components/marketing/PricingCards";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import {
  LANDING_PROOF_PRIMARY,
  LANDING_PROOF_SECONDARY,
  PROOF_LEGAL_NOTE,
  VALIDATION_METRICS,
} from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: `${BRAND_NAME} - Dynamic match intelligence`,
  description:
    "Win probabilities, expected goals, and market lines from club form, lineups, weather, and history.",
};

const PIPELINE = [
  {
    title: "Club context in",
    body: "Form, lineups, weather, and historical results feed the league models before a fixture is priced.",
  },
  {
    title: "Ratings to xG-style estimates",
    body: "Team strength signals become expected goals style estimates - research numbers, not guarantees.",
  },
  {
    title: "Score distributions",
    body: "Those estimates expand into score matrices so markets share one coherent probability story.",
  },
  {
    title: "Market lines out",
    body: "1X2, BTTS, O/U, and related lines surface as model probabilities and fair-odds style views.",
  },
];

const MARKETS = ["1X2", "BTTS", "O/U", "Handicaps", "Fair odds", "+EV compare"];

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <MarketingHero />

      <section className="marketing-reveal marketing-reveal-delay-1 mt-16">
        <SectionHeading
          eyebrow="What it is"
          title="Football research that speaks market language."
          description={`${BRAND_NAME} turns club match context into win probabilities, expected goals style estimates, and market lines you can compare against book prices - for entertainment and research, not advice.`}
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Clear probabilities",
              body: "Home / draw / away and related markets in one read, without tipster theatrics.",
            },
            {
              title: "League-native models",
              body: "Built around club competitions and the weekly fixture grind you actually price.",
            },
            {
              title: "Edge workflow",
              body: "Paste decimal odds, compare fair lines, and see where the model disagrees with the book.",
            },
          ].map((card) => (
            <article key={card.title} className="liquid-glass-panel rounded-2xl p-5">
              <h3 className="text-lg font-bold text-foreground">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-reveal marketing-reveal-delay-2 mt-16">
        <SectionHeading
          eyebrow="How intel is built"
          title="From match context to market probabilities."
          description="High-level pipeline only - no secret weights. League models consume club signals and publish research estimates."
        />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {PIPELINE.map((step, index) => (
            <li key={step.title} className="liquid-glass-panel rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Step {index + 1}
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <Link
            href="/methodology"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Read the methodology →
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Markets"
          title="Lines built for how you actually research."
          align="left"
        />
        <div className="mt-6 flex flex-wrap gap-2">
          {MARKETS.map((market) => (
            <span
              key={market}
              className="rounded-full border border-glass-border bg-surface px-4 py-2 text-sm font-semibold text-foreground"
            >
              {market}
            </span>
          ))}
        </div>
        <DisclaimerBanner className="mt-6" />
      </section>

      <section className="marketing-reveal mt-16">
        <SectionHeading
          eyebrow="In the numbers"
          title="A realistic sample - not a promise."
          description={LANDING_PROOF_PRIMARY}
        />
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {LANDING_PROOF_SECONDARY}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {VALIDATION_METRICS.map((metric) => (
            <article
              key={metric.label}
              className="metric-tile liquid-glass-panel rounded-2xl border border-glass-border p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {metric.label}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{metric.value}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {metric.detail}
              </p>
            </article>
          ))}
        </div>
        <DisclaimerBanner className="mt-6">
          {PROOF_LEGAL_NOTE}{" "}
          <Link href="/disclaimer" className="font-semibold underline underline-offset-2">
            Full disclaimer
          </Link>
          .
        </DisclaimerBanner>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Pricing"
          title="Three paid tiers. Fourteen-day trial on the waitlist."
          description="No free plan. Start with Pulse for core intel, Edge for the full league workflow, or Oracle when AI research chat opens."
        />
        <div className="mt-8">
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

      <section className="liquid-glass-panel mt-16 rounded-[2rem] px-6 py-12 text-center sm:px-10">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Ready to research cleaner?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Join the waitlist for a 14-day trial when tiers open, or sign in if you already have access.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="chromatic-cta rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
          >
            Join waitlist
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-glass-border bg-surface px-6 py-3 text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
        <DisclaimerBanner className="mx-auto mt-8 max-w-xl text-left sm:text-center" />
      </section>
    </div>
  );
}
