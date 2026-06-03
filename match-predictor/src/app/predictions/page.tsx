import Link from "next/link";
import { resolvePredictionTeamNamesBatch } from "@/lib/prediction/resolve-team-names";
import { createServerClient } from "@/lib/supabase";
import { PageHero } from "@/components/match-predictor/PageHero";
import { Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  let predictions: Array<{
    id: string;
    match_id: number;
    home_team_id: number;
    away_team_id: number;
    homeTeamName: string;
    awayTeamName: string;
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
        "id, match_id, home_team_id, away_team_id, home_league_id, away_league_id, inputs_snapshot, city, match_date, home_win_pct, away_win_pct, draw_pct, home_xg, away_xg, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      error = fetchError.message;
    } else {
      const rows = data ?? [];
      const teamNames = await resolvePredictionTeamNamesBatch(supabase, rows);
      predictions = rows.map((p) => {
        const names = teamNames.get(p.id) ?? {
          homeTeamName: `Team ${p.home_team_id}`,
          awayTeamName: `Team ${p.away_team_id}`,
        };
        return {
          id: p.id,
          match_id: p.match_id,
          home_team_id: p.home_team_id,
          away_team_id: p.away_team_id,
          homeTeamName: names.homeTeamName,
          awayTeamName: names.awayTeamName,
          city: p.city,
          match_date: p.match_date,
          home_win_pct: p.home_win_pct,
          away_win_pct: p.away_win_pct,
          draw_pct: p.draw_pct,
          home_xg: p.home_xg,
          away_xg: p.away_xg,
          created_at: p.created_at,
        };
      });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to Supabase";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Archive"
        title="Prediction History"
        description="Recent predictions you have saved."
      />

      {error && (
        <div className="system-banner mb-6 flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Could not load predictions: {error}. Run the Supabase migration and check your env vars.
        </div>
      )}

      {predictions.length === 0 && !error ? (
        <div className="liquid-glass-panel rounded-[2rem] border border-dashed border-slate-300/50 p-12 text-center dark:border-slate-700/50">
          <p className="text-slate-500 dark:text-slate-400">No predictions yet.</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-800 dark:text-cyan-400 dark:hover:text-cyan-300"
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
              className="liquid-glass-pill group block rounded-full px-6 py-4 transition hover:scale-[1.01]"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {p.homeTeamName}{" "}
                    <span className="font-medium text-slate-400">vs</span> {p.awayTeamName}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {p.city}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(p.match_date).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZoneName: "short",
                      })}
                    </span>
                    <span className="text-xs uppercase tracking-wide">
                      Fixture #{p.match_id}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 font-semibold text-cyan-800 dark:text-cyan-300">
                    {Number(p.home_win_pct)}%
                  </span>
                  <span className="rounded-full bg-slate-500/10 px-2.5 py-0.5 font-semibold text-slate-600 dark:text-slate-400">
                    {Number(p.draw_pct)}%
                  </span>
                  <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 font-semibold text-violet-800 dark:text-fuchsia-300">
                    {Number(p.away_win_pct)}%
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    xG {Number(p.home_xg)} – {Number(p.away_xg)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
