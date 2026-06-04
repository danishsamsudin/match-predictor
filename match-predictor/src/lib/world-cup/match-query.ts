import { WORLD_CUP_2026_TOURNAMENT_END, WORLD_CUP_2026_TOURNAMENT_START } from "@/lib/world-cup/group-draw";

/** Supabase `.or()` filter for finals tournament rows (FBref + merged imports). */
export const WORLD_CUP_FINALS_COMPETITION_OR =
  "competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup";

export const WORLD_CUP_FINALS_DATE_RANGE = {
  start: WORLD_CUP_2026_TOURNAMENT_START,
  end: WORLD_CUP_2026_TOURNAMENT_END,
} as const;
