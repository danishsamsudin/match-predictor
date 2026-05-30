import Link from "next/link";
import { notFound } from "next/navigation";
import { PredictionResultDisplay } from "@/components/PredictionResult";
import { createServerClient } from "@/lib/supabase";
import { ArrowLeft } from "lucide-react";

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/predictions"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to history
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Team {data.home_team_id} vs Team {data.away_team_id}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {data.city} · {new Date(data.match_date).toLocaleString()} · Fixture #
          {data.match_id}
        </p>
        <p className="mt-1 text-xs text-muted/70">
          Predicted {new Date(data.created_at).toLocaleString()}
        </p>
      </div>

      <PredictionResultDisplay result={data} />
    </div>
  );
}
