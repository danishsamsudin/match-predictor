import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import type { GlpmDataProvider } from "../types";

type Client = SupabaseClient<Database>;

export async function upsertProviderPayload(
  supabase: Client,
  args: {
    provider: GlpmDataProvider;
    endpoint: string;
    entityType: string;
    entityKey: string;
    payload: unknown;
  }
): Promise<void> {
  const { error } = await supabase.from("glpm_provider_payloads").upsert(
    {
      provider: args.provider,
      endpoint: args.endpoint,
      entity_type: args.entityType,
      entity_key: args.entityKey,
      payload: args.payload as Database["public"]["Tables"]["glpm_provider_payloads"]["Insert"]["payload"],
      synced_at: new Date().toISOString(),
    },
    { onConflict: "provider,endpoint,entity_type,entity_key" }
  );
  if (error) throw new Error(`upsertProviderPayload failed: ${error.message}`);
}

/** @deprecated Use upsertProviderPayload with provider='wyscout' */
export async function upsertWyscoutPayload(
  supabase: Client,
  args: {
    endpoint: string;
    entityType: string;
    entityKey: string;
    payload: unknown;
  }
): Promise<void> {
  return upsertProviderPayload(supabase, { provider: "wyscout", ...args });
}
