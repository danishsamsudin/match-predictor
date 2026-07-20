import type {
  WyscoutMatchAdvancedStatsPayload,
  WyscoutTeamAdvancedStatsSide,
} from "../../wyscout/types";

export function listAdvancedStatsSides(
  payload: WyscoutMatchAdvancedStatsPayload
): WyscoutTeamAdvancedStatsSide[] {
  if (payload.teams && typeof payload.teams === "object") {
    return Object.values(payload.teams);
  }
  if (Array.isArray(payload.general)) return payload.general;
  return [];
}

/** @deprecated Wyscout is enrich-only; use sportmonks/upsertFixture for primary ingest. */
export function mapAdvancedStatsSide(): never {
  throw new Error(
    "mapAdvancedStatsSide is deprecated; SportMonks is the primary ingest path"
  );
}
