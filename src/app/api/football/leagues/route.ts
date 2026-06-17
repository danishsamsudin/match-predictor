import { NextRequest, NextResponse } from "next/server";
import { lookupLeagues } from "@/lib/api/football-lookup";
import type { EntityType } from "@/lib/types/football-lookup";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim();
  if (!country) {
    return NextResponse.json({ error: "Missing country parameter" }, { status: 400 });
  }

  const entityTypeParam = request.nextUrl.searchParams.get("entityType");
  const entityType: EntityType | undefined =
    entityTypeParam === "national" ? "national" : entityTypeParam === "club" ? "club" : undefined;

  try {
    const leagues = await lookupLeagues(country, entityType);
    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("Failed to load leagues:", error);
    return NextResponse.json({ error: "Failed to load leagues" }, { status: 500 });
  }
}
