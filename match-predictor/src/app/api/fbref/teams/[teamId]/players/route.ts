import { NextRequest, NextResponse } from "next/server";
import {
  fbrefStoreAvailable,
  listFbrefPlayerStatsForTeam,
  listFbrefPlayersForTeam,
} from "@/lib/fbref/supabase-store";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await context.params;
  if (!teamId?.trim()) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  if (!fbrefStoreAvailable()) {
    return NextResponse.json(
      {
        error:
          "Supabase service role not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 503 }
    );
  }

  try {
    const [players, stats] = await Promise.all([
      listFbrefPlayersForTeam(teamId),
      listFbrefPlayerStatsForTeam(teamId),
    ]);
    const statsByPlayer = new Map<string, typeof stats>();
    for (const row of stats) {
      const list = statsByPlayer.get(row.player_id) ?? [];
      list.push(row);
      statsByPlayer.set(row.player_id, list);
    }
    return NextResponse.json({
      teamId,
      players: players.map((p) => ({
        ...p,
        stats: statsByPlayer.get(p.id) ?? [],
      })),
      count: players.length,
    });
  } catch (error) {
    console.error("fbref players:", error);
    return NextResponse.json({ error: "Failed to load FBref players" }, { status: 500 });
  }
}
