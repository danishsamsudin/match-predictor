import { NextRequest, NextResponse } from "next/server";
import { lookupCountries } from "@/lib/api/football-lookup";
import type { EntityType } from "@/lib/types/football-lookup";

export async function GET(request: NextRequest) {
  const entityTypeParam = request.nextUrl.searchParams.get("entityType");
  const entityType: EntityType | undefined =
    entityTypeParam === "national" ? "national" : entityTypeParam === "club" ? "club" : undefined;

  try {
    const countries = await lookupCountries(entityType);
    return NextResponse.json({ countries });
  } catch (error) {
    console.error("Failed to load countries:", error);
    return NextResponse.json({ error: "Failed to load countries" }, { status: 500 });
  }
}
