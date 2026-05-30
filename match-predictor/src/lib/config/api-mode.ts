import { getMockModeReason } from "@/lib/env/server-env";

export function shouldUseMockApis(): boolean {
  return getMockModeReason() !== null;
}

export { getMockModeReason };
