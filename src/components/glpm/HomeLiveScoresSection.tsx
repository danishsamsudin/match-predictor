import { HomeLiveScoresPanel } from "@/components/glpm/HomeLiveScoresPanel";
import { createServerClient, tryCreateServiceClient } from "@/lib/supabase";
import { emptyLiveScoresBoard, loadLiveScoresBoard } from "@/lib/glpm/live-scores/load";

/**
 * Isolated async boundary so live-score enrichment await graphs do not share
 * a visitAsyncNode traversal with the rest of /home (Next.js dev stack overflow).
 */
export async function HomeLiveScoresSection() {
  const client = tryCreateServiceClient() ?? createServerClient();
  let board = emptyLiveScoresBoard();
  try {
    board = await loadLiveScoresBoard(client);
  } catch (error) {
    console.warn("[home] live scores load failed", error);
  }
  return <HomeLiveScoresPanel board={board} />;
}

export function HomeLiveScoresFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading live scores">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl border border-glass-border bg-slate-100/80 dark:bg-slate-900/50"
        />
      ))}
    </div>
  );
}
