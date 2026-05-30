import { NextResponse } from "next/server";
import { getMockModeReason, shouldUseMockApis } from "@/lib/config/api-mode";
import { getFootballProvider } from "@/lib/config/football-provider";
import { getSportApiBaseUrl, getSportApiHost, sportApiGet, todayDateString } from "@/lib/api/sportapi/client";
import { serverEnv } from "@/lib/env/server-env";
import type { SportApiCategoriesResponse } from "@/lib/types/sportapi";
import { UpstreamApiError } from "@/lib/types/prediction";

export async function GET() {
  const provider = getFootballProvider();
  const mock = shouldUseMockApis();
  const mockReason = getMockModeReason();

  if (mock) {
    return NextResponse.json({
      ok: true,
      provider,
      mode: "mock",
      mockReason,
      env: {
        useMockApis: serverEnv.useMockApis,
        hasRapidApiKey: Boolean(serverEnv.rapidApiKey),
      },
      message: mockReason ?? "Mock mode is active.",
    });
  }

  if (provider !== "sportapi7") {
    return NextResponse.json({
      ok: true,
      provider,
      mode: "live",
      message: "Using API-Football provider. SportAPI7 status not checked.",
    });
  }

  try {
    const today = todayDateString();
    const data = await sportApiGet<SportApiCategoriesResponse>(
      `/api/v1/sport/football/${today}/0/categories`,
      `health:categories:${today}`,
      { skipCache: true }
    );
    const count = data.categories?.length ?? 0;
    return NextResponse.json({
      ok: true,
      provider: "sportapi7",
      mode: "live",
      baseUrl: getSportApiBaseUrl(),
      host: getSportApiHost(),
      categoriesToday: count,
      message: "SportAPI7 connection successful.",
    });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError
        ? error.message
        : "SportAPI7 health check failed.";
    return NextResponse.json(
      {
        ok: false,
        provider: "sportapi7",
        mode: "live",
        baseUrl: getSportApiBaseUrl(),
        host: getSportApiHost(),
        message,
        subscribeUrl: "https://rapidapi.com/rapidsportapi/api/sportapi7",
      },
      { status: 502 }
    );
  }
}
