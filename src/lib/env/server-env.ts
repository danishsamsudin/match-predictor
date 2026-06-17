/**
 * Server-only environment reads with literal `process.env.*` names so Next.js
 * can inline them at build time (dynamic `process.env[name]` is undefined in production).
 */
function trimEnv(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export const serverEnv = {
  get rapidApiKey(): string | undefined {
    return (
      trimEnv(process.env.RAPIDAPI_KEY) ??
      trimEnv(process.env.FOOTBALL_API_KEY) ??
      trimEnv(process.env.WEATHER_API_KEY) ??
      trimEnv(process.env.SPORTAPI_KEY)
    );
  },
  get useMockApis(): boolean {
    return trimEnv(process.env.USE_MOCK_APIS) === "true";
  },
  get footballProvider(): string | undefined {
    return trimEnv(process.env.FOOTBALL_PROVIDER);
  },
  get weatherProvider(): string | undefined {
    return trimEnv(process.env.WEATHER_PROVIDER);
  },
  get openMeteoApiKey(): string | undefined {
    return trimEnv(process.env.OPEN_METEO_API_KEY);
  },
  get sportApiRapidApiHost(): string | undefined {
    return trimEnv(process.env.SPORTAPI_RAPIDAPI_HOST);
  },
  get footballPrimaryProvider(): string | undefined {
    return trimEnv(process.env.FOOTBALL_PRIMARY_PROVIDER);
  },
  get footballSecondaryProvider(): string | undefined {
    return trimEnv(process.env.FOOTBALL_SECONDARY_PROVIDER);
  },
  get dataSource(): string | undefined {
    return trimEnv(process.env.DATA_SOURCE);
  },
  get useSupabaseData(): boolean {
    return trimEnv(process.env.USE_SUPABASE_DATA) === "true";
  },
  get soccerdataDir(): string | undefined {
    return trimEnv(process.env.SOCCERDATA_DIR);
  },
  get soccerdataEnabled(): boolean {
    return trimEnv(process.env.SOCCERDATA_ENABLED) !== "false";
  },
};

export function getMockModeReason(): string | null {
  if (serverEnv.useMockApis) {
    return "USE_MOCK_APIS=true";
  }
  const key = serverEnv.rapidApiKey;
  if (!key) {
    return "No RAPIDAPI_KEY (or FOOTBALL_API_KEY) in environment";
  }
  const lower = key.toLowerCase();
  if (
    lower.startsWith("your_") ||
    lower.includes("placeholder") ||
    lower === "example" ||
    lower.startsWith("example-")
  ) {
    return "API key looks like a placeholder";
  }
  return null;
}
