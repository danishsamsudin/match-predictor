import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Data sources",
  description: `Football data providers and platforms behind ${BRAND_NAME} match intelligence - fixtures, stats, odds, xG, and weather.`,
  alternates: { canonical: "/sources" },
};

export const revalidate = 3600;

const SOURCES = [
  {
    name: "SportMonks",
    detail:
      "Primary club data for GLPM leagues: fixtures, results, standings context, events, and related match metadata.",
  },
  {
    name: "The Odds API",
    detail:
      "Bookmaker prices including sharp-book references used for fair-odds compare and Value Opportunities autofill.",
  },
  {
    name: "SofaScore / RapidAPI football feeds",
    detail: "Legacy and supplemental match catalog sync where still used in the wider platform.",
  },
  {
    name: "Understat-style xG overlays",
    detail: "Season team and player xG-style context for selected leagues when available.",
  },
  {
    name: "FBref & Opta-style imports",
    detail: "Supplemental squad, fixture, and post-match statistic imports for research pipelines.",
  },
  {
    name: "Scoutlyst & SoFIFA",
    detail: "Player rating and squad enrichment when primary ratings are incomplete.",
  },
  {
    name: "Open-Meteo",
    detail: "Weather forecasts for match city and kickoff date.",
  },
  {
    name: "ClubElo / MatchHistory (via SoccerData)",
    detail: "Historical strength and odds enrichment used in research tooling where configured.",
  },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Transparency"
        title="Data sources"
        description={`Where ${BRAND_NAME} gets the numbers behind fixtures, squads, odds, and predictions. Provider mixes can change as coverage expands.`}
      />

      <ul className="mt-10 space-y-6">
        {SOURCES.map((item) => (
          <li key={item.name} className="border-l-2 border-primary/40 pl-4">
            <h2 className="text-base font-bold text-foreground">{item.name}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>

      <DisclaimerBanner className="mt-10">
        Third-party data may be delayed, incomplete, or wrong. Model outputs remain entertainment /
        research estimates. We do not republish provider raw dumps. Provider names are for
        transparency, not endorsement.
      </DisclaimerBanner>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/methodology"
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          Methodology
        </Link>
        <Link href="/" className="rounded-full px-5 py-2.5 text-sm font-semibold text-primary hover:underline">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
