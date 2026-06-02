import { shouldUseMockApis } from "@/lib/config/api-mode";
import { getWeatherDailyApiLimit } from "@/lib/config/data-source";
import { tryCreateServiceClient } from "@/lib/supabase";
import { RateLimitError } from "@/lib/types/prediction";

type ApiProvider = "football" | "weather";

interface CachedFetchOptions<T> {
  provider: ApiProvider;
  cacheKey: string;
  ttlMs: number;
  dailyLimit: number;
  fetcher: () => Promise<T>;
}

interface CachedFetchResult<T> {
  data: T;
  fromCache: boolean;
  stale?: boolean;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}


export async function cachedFetch<T>(
  opts: CachedFetchOptions<T>
): Promise<CachedFetchResult<T>> {
  if (shouldUseMockApis()) {
    return { data: await opts.fetcher(), fromCache: false };
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return { data: await opts.fetcher(), fromCache: false };
  }

  const now = new Date();

  const { data: cached } = await supabase
    .from("api_cache")
    .select("*")
    .eq("cache_key", opts.cacheKey)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > now) {
    return { data: cached.response as T, fromCache: true };
  }

  const { data: usage } = await supabase
    .from("api_usage_daily")
    .select("call_count")
    .eq("provider", opts.provider)
    .eq("usage_date", todayDateString())
    .maybeSingle();

  const currentCount = usage?.call_count ?? 0;

  if (currentCount >= opts.dailyLimit) {
    if (cached) {
      return { data: cached.response as T, fromCache: true, stale: true };
    }
    throw new RateLimitError(
      `Daily ${opts.provider} API limit reached (${opts.dailyLimit}/day). Try again tomorrow or enable USE_MOCK_APIS=true for development.`
    );
  }

  const data = await opts.fetcher();
  const expiresAt = new Date(now.getTime() + opts.ttlMs);

  await supabase.from("api_cache").upsert({
    cache_key: opts.cacheKey,
    provider: opts.provider,
    response: data as unknown,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (usage) {
    await supabase
      .from("api_usage_daily")
      .update({ call_count: currentCount + 1 })
      .eq("provider", opts.provider)
      .eq("usage_date", todayDateString());
  } else {
    await supabase.from("api_usage_daily").insert({
      provider: opts.provider,
      usage_date: todayDateString(),
      call_count: 1,
    });
  }

  return { data, fromCache: false };
}

export const TTL = {
  WEATHER: 6 * 60 * 60 * 1000,
  FOOTBALL: 12 * 60 * 60 * 1000,
} as const;

export const DAILY_LIMITS = {
  get weather() {
    return getWeatherDailyApiLimit();
  },
  football: 2,
} as const;
