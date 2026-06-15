import { NextResponse } from "next/server";
import { loadWorldCupHubPayload } from "@/lib/world-cup/hub-load";

export const revalidate = 3600;

export async function GET() {
  const payload = await loadWorldCupHubPayload();
  if (!payload) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  return NextResponse.json({
    groupMatrix: payload.groupMatrix,
    thirdPlaceRanking: payload.thirdPlaceRanking,
    knockoutProjection: payload.knockoutProjection,
    updatedAt: payload.updatedAt,
  });
}
