import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Features",
  description: `League-first match intelligence features in ${BRAND_NAME}.`,
};

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
    title: "League Hub",
    body: "Rating leaders, recent results, and model lines for club competitions - flip into markets without leaving the fixture context.",
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
    body: "Paste bookmaker decimal odds and compare them to model-implied fair prices. Edge is informational; you decide what to do with it.",
  },
  {
    title: "Prediction history",
    body: "Keep a trail of generated cards so you can review how the model framed past fixtures over time.",
  },
  {
    title: "Oracle AI chat (tier)",
    body: "Ask match questions and research prompts against platform context. Answers stay entertainment / research only - not betting advice.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Features"
        title="Built for the weekly league grind."
        description={`${BRAND_NAME} is league-first: hubs, markets, and fair-odds tools for club fixtures. Estimates only - never a guaranteed edge.`}
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature, index) => (
          <article
            key={feature.title}
            className={`liquid-glass-panel rounded-2xl p-6 marketing-reveal marketing-reveal-delay-${(index % 3) + 1}`}
          >
            <h2 className="text-xl font-bold text-foreground">{feature.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {feature.body}
            </p>
          </article>
        ))}
      </div>

      <DisclaimerBanner className="mt-8" />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
        >
          Join waitlist
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
