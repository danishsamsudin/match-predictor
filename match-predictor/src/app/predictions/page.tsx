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
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-emphasis">
          Archive
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-gradient">Prediction History</h1>
        <p className="mt-2 text-muted">
          Recent predictions saved to your Supabase database.
        </p>
      </div>

      {error && (
        <div className="alert-accent mb-6 rounded-xl px-4 py-3 text-sm">
          Could not load predictions: {error}. Run the Supabase migration and check your env vars.
        </div>
      )}

      {predictions.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-glass-border p-12 text-center glass-subtle">
          <p className="text-muted">No predictions yet.</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-primary hover:text-primary-light"
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
              className="group block rounded-xl glass p-4 transition hover:glow-primary"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">
                    Team {p.home_team_id} vs Team {p.away_team_id}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
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
                    <span className="text-primary">{Number(p.home_win_pct)}%</span>
                    {" / "}
                    <span className="text-muted">{Number(p.draw_pct)}%</span>
                    {" / "}
                    <span className="text-accent">{Number(p.away_win_pct)}%</span>
                  </p>
                  <p className="text-muted">
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
