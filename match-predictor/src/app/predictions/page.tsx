import Link from "next/link";
import { PredictionHistoryCard } from "@/components/predictions/PredictionHistoryCard";
import { PageHero } from "@/components/match-predictor/PageHero";
import { loadPredictionHistoryFeed } from "@/lib/prediction/load-history-feed";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  let items: Awaited<ReturnType<typeof loadPredictionHistoryFeed>> = [];
  try {
    const supabase = createServerClient();
    items = await loadPredictionHistoryFeed(supabase, 50);
  } catch {
    items = [];
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <PageHero
        eyebrow="Archive"
        title="Prediction History"
        description="Latest model runs from anyone using the site — league fixtures, head-to-head comparisons, and World Cup matches."
      />

      {items.length === 0 ? (
        <div className="liquid-glass-panel rounded-2xl border border-dashed border-slate-300/50 p-8 text-center sm:rounded-[2rem] sm:p-12 dark:border-slate-700/50">
          <p className="text-slate-500 dark:text-slate-400">
            No community predictions yet. Run one from the home page or World Cup hub.
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-2 text-sm font-semibold sm:flex-row sm:gap-4">
            <Link
              href="/"
              className="text-indigo-600 hover:text-indigo-800 dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              Predict a match →
            </Link>
            <Link
              href="/world-cup"
              className="text-indigo-600 hover:text-indigo-800 dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              World Cup hub →
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5 sm:space-y-3">
          {items.map((item) => (
            <li key={item.key}>
              <PredictionHistoryCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
