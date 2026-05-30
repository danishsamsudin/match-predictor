/**
 * Server-only environment reads with literal variable names so Next.js
 * includes them from .env.local at dev/build time.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export const serverEnv = {
  get rapidApiKey(): string | undefined {
    return (
      read("RAPIDAPI_KEY") ??
      read("FOOTBALL_API_KEY") ??
      read("WEATHER_API_KEY") ??
      read("SPORTAPI_KEY")
    );
  },
  get useMockApis(): boolean {
    return read("USE_MOCK_APIS") === "true";
  },
  get footballProvider(): string | undefined {
    return read("FOOTBALL_PROVIDER");
  },
  get weatherProvider(): string | undefined {
    return read("WEATHER_PROVIDER");
  },
  get sportApiRapidApiHost(): string | undefined {
    return read("SPORTAPI_RAPIDAPI_HOST");
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
