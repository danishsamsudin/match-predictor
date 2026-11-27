import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import { COVERAGE_LEAGUES } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "Features",
  description: `League-first match intelligence in ${BRAND_NAME}: hubs, markets, fair odds, and Value Opportunities.`,
  alternates: { canonical: "/features" },
};

export const revalidate = 3600;

const FEATURES = [
  {
    title: "App hub",
    body: "Live scores, upcoming fixtures, and standings for the leagues you follow - one place to scan the slate before you dig into lines.",
  },
  {
    title: "Predict workflow",
    body: "Generate club match estimates with win probabilities, expected goals style outputs, and market views in a single research card.",
  },
  {
    title: "League Hub & xG",
    body: "Team strength context and xG-style tables for club competitions - stay inside the fixture grind.",
  },
  {
    title: "Core markets",
    body: "1X2, BTTS, and O/U lines from one coherent score story, so related markets do not contradict each other.",
  },
  {
    title: "Expanded markets",
    body: "Handicaps and props where coverage is available - still framed as model estimates, not tips.",
  },
  {
    title: "Fair odds & +EV compare",
    body: "Paste or autofill bookmaker decimal odds and compare them to model-implied fair prices. Edge is informational.",
  },
  {
    title: "Value Opportunities",
    body: "Confidence tiers, historical edge context, Kelly-style stake sizing language, and Bet / Watch / Pass actions - research framing only.",
  },
  {
    title: "Prediction history & reports",
    body: "Keep a trail of generated cards and export research reports where available.",
  },
  {
    title: "Oracle AI chat (tier)",
    body: "Ask match questions and research prompts against platform context. Answers stay entertainment / research only.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Features"
        title="Built for the weekly league grind."
        description={`${BRAND_NAME} is league-first: hubs, markets, fair-odds tools, and Value Opportunities for club fixtures. Estimates only - never a guaranteed edge.`}
      />

      <div className="mt-10">
        <ProductPreview />
      </div>

      <section id="coverage" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-bold text-foreground">Coverage</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Club product focus across five leagues.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {COVERAGE_LEAGUES.map((league) => (
            <span
              key={league}
              className="glass-chip rounded-full px-4 py-2 text-sm font-semibold text-foreground"
            >
              {league}
            </span>
          ))}
        </div>
      </section>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="border-l-2 border-primary/40 pl-4">
            <h2 className="text-xl font-bold text-foreground">{feature.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {feature.body}
            </p>
          </article>
        ))}
      </div>

      <DisclaimerBanner className="mt-10" />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
        >
          Request beta access
        </Link>
        <Link
          href="/methodology"
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          How models work
        </Link>
      </div>
    </div>
  );
}
