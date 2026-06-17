import { getFootballDailyApiLimit } from "@/lib/config/data-source";
import { tryCreateServiceClient } from "@/lib/supabase";
import { RateLimitError } from "@/lib/types/prediction";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getRemainingFootballBudget(): Promise<number> {
  const used = await getFootballCallsUsedToday();
  return Math.max(0, getFootballDailyApiLimit() - used);
}

export async function getFootballCallsUsedToday(): Promise<number> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return 0;

  const { data } = await supabase
    .from("football_api_daily")
    .select("call_count")
    .eq("usage_date", todayDateString())
    .maybeSingle();

  return data?.call_count ?? 0;
}

export async function assertFootballApiBudget(): Promise<void> {
  const used = await getFootballCallsUsedToday();
  const limit = getFootballDailyApiLimit();
  if (used >= limit) {
    throw new RateLimitError(
      `Daily football API limit reached (${used}/${limit}). Data will be read from Supabase until tomorrow's sync.`
    );
  }
}

export async function recordFootballApiCall(meta?: {
  provider?: string;
  endpoint?: string;
}): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;

  const usageDate = todayDateString();
  const { data: row } = await supabase
    .from("football_api_daily")
    .select("call_count")
    .eq("usage_date", usageDate)
    .maybeSingle();

  const next = (row?.call_count ?? 0) + 1;

  await supabase.from("football_api_daily").upsert({
    usage_date: usageDate,
    call_count: next,
    last_provider: meta?.provider ?? null,
    last_endpoint: meta?.endpoint ?? null,
    updated_at: new Date().toISOString(),
  });

  if (meta?.endpoint) {
    await supabase.from("football_api_call_log").insert({
      usage_date: usageDate,
      provider: meta.provider ?? "unknown",
      endpoint: meta.endpoint,
    });
  }
}
