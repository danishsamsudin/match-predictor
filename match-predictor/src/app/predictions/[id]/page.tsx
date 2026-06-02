import Link from "next/link";
import { notFound } from "next/navigation";
import { PredictionResultDisplay } from "@/components/PredictionResult";
import { resolvePredictionTeamNames } from "@/lib/prediction/resolve-team-names";
import { createServerClient } from "@/lib/supabase";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

async function fetchPrediction(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export default async function PredictionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchPrediction(id).catch(() => null);

  if (!data) {
    notFound();
  }

  const supabase = createServerClient();
  const { homeTeamName, awayTeamName } = await resolvePredictionTeamNames(supabase, {
    id: data.id,
    home_team_id: data.home_team_id,
    away_team_id: data.away_team_id,
    match_id: data.match_id,
    inputs_snapshot: data.inputs_snapshot,
    home_league_id: data.home_league_id,
    away_league_id: data.away_league_id,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href="/predictions"
        className="liquid-glass-pill mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to history
      </Link>

      <div className="liquid-glass-panel mb-8 rounded-[2rem] p-6 sm:p-8">
        <p className="page-hero-eyebrow text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-cyan-400">
          Match detail
        </p>
        <h1 className="hero-title-glow mt-2 text-3xl font-extrabold tracking-tighter sm:text-4xl">
          {homeTeamName}{" "}
          <span className="font-medium text-slate-400 dark:text-slate-600">vs</span>{" "}
          {awayTeamName}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {data.city}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {new Date(data.match_date).toLocaleString()}
          </span>
          <span className="text-xs uppercase tracking-wide">Fixture #{data.match_id}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Predicted {new Date(data.created_at).toLocaleString()}
        </p>
      </div>

      <PredictionResultDisplay
        result={data}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
      />
    </div>
  );
}
