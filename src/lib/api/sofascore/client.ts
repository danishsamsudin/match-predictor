import axios, { type AxiosError } from "axios";
import { normalizeSofascorePayload } from "@/lib/api/sofascore/normalize";
import { createRapidApiClient } from "@/lib/config/rapidapi";
import { getPrimaryFootballHost } from "@/lib/config/football-providers";
import { RateLimitError, UpstreamApiError } from "@/lib/types/prediction";

export function getSofascoreHost(): string {
  return getPrimaryFootballHost();
}

function getClient() {
  return createRapidApiClient(getSofascoreHost(), { timeout: 30000 });
}

function parseError(error: unknown): never {
  if (error instanceof RateLimitError || error instanceof UpstreamApiError) {
    throw error;
  }
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<{ message?: string }>;
    const msg = ax.response?.data?.message ?? ax.message;
    const status = ax.response?.status;
    const lower = msg.toLowerCase();
    if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
      throw new RateLimitError(msg);
    }
    throw new UpstreamApiError(`SofaScore API error (${status ?? "?"}): ${msg}`);
  }
  throw new UpstreamApiError(error instanceof Error ? error.message : "SofaScore request failed");
}

function assertPayload<T>(data: T): T {
  if (data && typeof data === "object" && "message" in data) {
    const msg = String((data as { message?: string }).message ?? "");
    if (msg.includes("does not exist")) {
      throw new UpstreamApiError(msg);
    }
    const lower = msg.toLowerCase();
    if (lower.includes("quota") || lower.includes("rate limit")) {
      throw new RateLimitError(msg);
    }
  }
  return data;
}

export async function sofascoreGet<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  try {
    const client = getClient();
    const response = await client.get<T>(path, { params: query });
    if (response.status === 204) {
      return {} as T;
    }
    const data = assertPayload(response.data);
    return normalizeSofascorePayload<T>(path, data);
  } catch (error) {
    parseError(error);
  }
}
