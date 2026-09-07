import { NextResponse } from "next/server";
import { createServerClient, tryCreateServiceClient } from "@/lib/supabase";
import { emptyLiveScoresBoard, loadLiveScoresBoard } from "@/lib/glpm/live-scores/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public board payload for the home Live Scores panel.
 * Client polls this about once a minute while the tab is visible.
 */
export async function GET() {
  try {
    const client = tryCreateServiceClient() ?? createServerClient();
    const board = await loadLiveScoresBoard(client);
    return NextResponse.json(board, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load live scores";
    console.warn("[api/glpm/live-scores]", message);
    return NextResponse.json(emptyLiveScoresBoard(), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }
}
