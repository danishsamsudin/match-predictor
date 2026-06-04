import { NextResponse } from "next/server";
import { getMockModeReason, shouldUseMockApis } from "@/lib/config/api-mode";
import {
  isSupabaseDataStore,
  getFootballDailyApiLimit,
  getWeatherDailyApiLimit,
} from "@/lib/config/data-source";
import {
  getPrimaryFootballHost,
  getPrimaryProviderName,
  getSecondaryFootballHost,
} from "@/lib/config/football-providers";
import { getFootballProvider } from "@/lib/config/football-provider";
import { getOpenMeteoVersionInfo } from "@/lib/config/open-meteo";
import { sofascoreGet } from "@/lib/api/sofascore/client";
import { getSportApiBaseUrl, getSportApiHost, sportApiGet, todayDateString } from "@/lib/api/sportapi/client";
import { getFootballCallsUsedToday } from "@/lib/sync/football-api-budget";
import { getSyncStatus } from "@/lib/data/football-store";
import { serverEnv } from "@/lib/env/server-env";
import type { SportApiCategoriesResponse } from "@/lib/types/sportapi";
import { UpstreamApiError } from "@/lib/types/prediction";

export async function GET() {
  const provider = getFootballProvider();
  const primary = getPrimaryProviderName();
  const mock = shouldUseMockApis();
  const mockReason = getMockModeReason();
  const footballCallsToday = await getFootballCallsUsedToday();
  const dailyLimit = getFootballDailyApiLimit();
  const weatherDailyLimit = getWeatherDailyApiLimit();
  const openMeteo = getOpenMeteoVersionInfo();
  const syncStatus = await getSyncStatus();

  const weatherApi = {
    provider: "open-meteo" as const,
    ok: !mock,
    message: mock
      ? "Mock mode — weather uses local fixtures."
      : "Open-Meteo configured (no RapidAPI key required). Run npm run test:live to probe.",
    version: openMeteo.version,
    dailyLimit: weatherDailyLimit,
  };

  if (mock) {
    return NextResponse.json({
      ok: true,
      provider,
      primary,
      mode: "mock",
      mockReason,
      dataSource: isSupabaseDataStore() ? "supabase" : "live",
      footballApi: { usedToday: footballCallsToday, dailyLimit },
      weatherApi,
      openMeteo,
      syncStatus,
      env: {
        useMockApis: serverEnv.useMockApis,
        hasRapidApiKey: Boolean(serverEnv.rapidApiKey),
        dataSourceConfig: serverEnv.dataSource ?? null,
        hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
        hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
        primaryHost: getPrimaryFootballHost(),
        secondaryHost: getSecondaryFootballHost(),
      },
      message: mockReason ?? "Mock mode is active.",
    });
  }

  if (primary === "sofascore") {
    try {
      await sofascoreGet<{ uniqueTournament?: { id: number; name: string } }>(
        "tournaments/detail",
        { tournamentId: 17 }
      );
      return NextResponse.json({
        ok: true,
        provider: "sofascore",
        primary,
        secondaryHost: getSecondaryFootballHost(),
        mode: "live",
        dataSource: isSupabaseDataStore() ? "supabase" : "live",
        footballApi: { usedToday: footballCallsToday, dailyLimit },
        weatherApi,
        openMeteo,
        syncStatus,
        message: "SofaScore (primary) connection successful.",
      });
    } catch (error) {
      const message =
        error instanceof UpstreamApiError
          ? error.message
          : "SofaScore health check failed.";
      return NextResponse.json({
        ok: false,
        provider: "sofascore",
        primary,
        mode: "live",
        footballApi: { usedToday: footballCallsToday, dailyLimit },
        message,
      });
    }
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
      primary,
      mode: "live",
      baseUrl: getSportApiBaseUrl(),
      host: getSportApiHost(),
      dataSource: isSupabaseDataStore() ? "supabase" : "live",
      footballApi: { usedToday: footballCallsToday, dailyLimit },
      weatherApi,
      openMeteo,
      syncStatus,
      categoriesToday: count,
      message: "SportAPI7 connection successful.",
    });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError
        ? error.message
        : "SportAPI7 health check failed.";
    return NextResponse.json({
      ok: false,
      provider: "sportapi7",
      primary,
      mode: "live",
      baseUrl: getSportApiBaseUrl(),
      host: getSportApiHost(),
      footballApi: { usedToday: footballCallsToday, dailyLimit },
      message,
      subscribeUrl: "https://rapidapi.com/rapidsportapi/api/sportapi7",
    });
  }
}
