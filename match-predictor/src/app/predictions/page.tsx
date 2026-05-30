import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  let predictions: Array<{
    id: string;
    match_id: number;
    home_team_id: number;
    away_team_id: number;
    city: string;
    match_date: string;
    home_win_pct: number;
    away_win_pct: number;
    draw_pct: number;
    home_xg: number;
    away_xg: number;
    created_at: string;
  }> = [];
  let error: string | null = null;

  try {
    const supabase = createServerClient();
    const { data, error: fetchError } = await supabase
      .from("predictions")
      .select(
        "id, match_id, home_team_id, away_team_id, city, match_date, home_win_pct, away_win_pct, draw_pct, home_xg, away_xg, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      error = fetchError.message;
    } else {
      predictions = data ?? [];
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to Supabase";
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Prediction History</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Recent predictions saved to your Supabase database.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Could not load predictions: {error}. Run the Supabase migration and check your env vars.
        </div>
      )}

      {predictions.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">No predictions yet.</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline"
          >
            Create your first prediction →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((p) => (
            <Link
              key={p.id}
              href={`/predictions/${p.id}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    Team {p.home_team_id} vs Team {p.away_team_id}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {p.city}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(p.match_date).toLocaleDateString()}
                    </span>
                    <span>Fixture #{p.match_id}</span>
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    <span className="text-emerald-600">{Number(p.home_win_pct)}%</span>
                    {" / "}
                    <span className="text-zinc-500">{Number(p.draw_pct)}%</span>
                    {" / "}
                    <span className="text-blue-600">{Number(p.away_win_pct)}%</span>
                  </p>
                  <p className="text-zinc-500">
                    xG {Number(p.home_xg)} – {Number(p.away_xg)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
