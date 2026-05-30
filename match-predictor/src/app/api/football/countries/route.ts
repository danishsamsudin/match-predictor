import { NextResponse } from "next/server";
import { lookupCountries } from "@/lib/api/football-lookup";

export async function GET() {
  try {
    const countries = await lookupCountries();
    return NextResponse.json({ countries });
  } catch (error) {
    console.error("Failed to load countries:", error);
    return NextResponse.json({ error: "Failed to load countries" }, { status: 500 });
  }
}
