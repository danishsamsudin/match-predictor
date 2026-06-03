import Link from "next/link";
import { PageHero } from "@/components/match-predictor/PageHero";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = {
  title: "Data sources",
};

const sources = [
  {
    name: "Match results & fixtures",
    detail: "Finished scores, schedules, and team metadata synced from our football data provider.",
  },
  {
    name: "League standings",
    detail: "Goals, form strings, and table position for season averages.",
  },
  {
    name: "Event statistics",
    detail: "Corners, fouls, cards, and shots on target aggregated from per-match stat feeds.",
  },
  {
    name: "Lineups",
    detail: "Starting elevens and formations inferred from recent match lineups.",
  },
  {
    name: "Scoutlyst",
    detail: "Player ratings and advanced per-player stats for squad performance scores.",
  },
  {
    name: "SoFIFA",
    detail: "Overall ratings used to enrich player quality when other ratings are missing.",
  },
  {
    name: "Open-Meteo",
    detail: "Weather forecasts for the match city and date.",
  },
  {
    name: "FIFA World Cup 2026 squads",
    detail: "Official 26-player squad lists for national teams at the tournament.",
  },
  {
    name: "FBref",
    detail: "Fallback squad and fixture data where primary feeds are incomplete.",
  },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Transparency"
        title="Data sources"
        description={`Where ${BRAND_NAME} gets the numbers behind comparisons, squads, and predictions.`}
      />
      <ul className="space-y-3">
        {sources.map((item) => (
          <li
            key={item.name}
            className="liquid-glass-pill rounded-2xl px-5 py-4"
          >
            <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
      <Link
        href="/"
        className="mt-8 inline-block text-sm font-semibold text-indigo-600 dark:text-cyan-400"
      >
        ← Back to predict
      </Link>
    </div>
  );
}
