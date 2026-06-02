import { assertSoccerdataMethod } from "@/lib/api/soccerdata/registry";
import {
  buildSoccerdataEntityKey,
  runSoccerdataBridge,
} from "@/lib/api/soccerdata/client";
import type {
  SoccerdataFetchRequest,
  SoccerdataFetchResult,
  SoccerdataSerializedData,
} from "@/lib/api/soccerdata/types";
import { SOCCERDATA_SOURCES } from "@/lib/api/soccerdata/types";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

const PROVIDER = "soccerdata";
const ENTITY_TYPE = "soccerdata_fetch";
/** SoccerData cache on disk is long-lived; Supabase mirror TTL matches other synced payloads. */
const SUPABASE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(syncedAt: string | null | undefined): boolean {
  if (!syncedAt) return false;
  return Date.now() - new Date(syncedAt).getTime() < SUPABASE_FRESH_MS;
}

async function readSoccerdataFromStore(
  entityKey: string
): Promise<{ data: SoccerdataSerializedData; syncedAt: string } | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("synced_api_payloads")
    .select("payload, synced_at")
    .eq("provider", PROVIDER)
    .eq("entity_type", ENTITY_TYPE)
    .eq("entity_key", entityKey)
    .maybeSingle();

  if (!data?.payload || !isFresh(data.synced_at)) return null;
  const payload = data.payload as { data?: SoccerdataSerializedData };
  if (!payload.data) return null;
  return { data: payload.data, syncedAt: data.synced_at };
}

async function persistSoccerdataFetch(
  entityKey: string,
  endpoint: string,
  envelope: { data: SoccerdataSerializedData }
): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;

  await supabase.from("synced_api_payloads").upsert({
    provider: PROVIDER,
    endpoint,
    entity_type: ENTITY_TYPE,
    entity_key: entityKey,
    payload: envelope as never,
    synced_at: new Date().toISOString(),
  });
}

export async function fetchSoccerdata(
  request: SoccerdataFetchRequest
): Promise<SoccerdataFetchResult> {
  const { source, method, constructor, params, persist = true, skipCache = false } = request;

  if (!SOCCERDATA_SOURCES.includes(source)) {
    throw new UpstreamApiError(`Invalid source: ${source}`);
  }
  assertSoccerdataMethod(source, method);

  const entityKey = buildSoccerdataEntityKey({ source, method, constructor, params });
  const endpoint = `${source}.${method}`;

  if (!skipCache) {
    const cached = await readSoccerdataFromStore(entityKey);
    if (cached) {
      return {
        source,
        method,
        cached: true,
        syncedAt: cached.syncedAt,
        data: cached.data,
      };
    }
  }

  const response = await runSoccerdataBridge({ source, method, constructor, params });
  if (!response.ok) {
    throw new UpstreamApiError(response.error);
  }

  const envelope = { data: response.data };
  if (persist) {
    await persistSoccerdataFetch(entityKey, endpoint, envelope);
  }

  return {
    source,
    method,
    cached: false,
    data: response.data,
  };
}

export async function fetchSoccerdataAvailableLeagues(
  source: SoccerdataFetchRequest["source"]
): Promise<string[]> {
  const result = await fetchSoccerdata({
    source,
    method: "available_leagues",
    constructor: {},
    persist: false,
    skipCache: true,
  });
  if (result.data.kind === "list") {
    return result.data.value.map(String);
  }
  throw new UpstreamApiError(`Unexpected response for available_leagues on ${source}.`);
}
