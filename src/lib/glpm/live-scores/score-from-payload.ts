import type { SmScore } from "@/lib/sportmonks/types";

/** Prefer live/current score descriptions over period partials (SportMonks order is unstable). */
const SCORE_DESCRIPTION_PRIORITY = [
  "CURRENT",
  "FULLTIME",
  "FT",
  "2ND_HALF",
  "ET",
  "AET",
  "PEN_SHOOTOUT",
  "1ST_HALF",
] as const;

/**
 * Read goals for one participant from SportMonks scores[].
 * Must not use Array.find across mixed descriptions - 1ST_HALF often appears
 * before CURRENT and would freeze FT results at 0-0.
 */
export function currentGoalsFromScores(
  scores: SmScore[] | undefined,
  participantId: number
): number | null {
  if (!scores?.length) return null;

  const forParticipant = scores.filter((s) => s.participant_id === participantId);
  if (forParticipant.length === 0) return null;

  for (const description of SCORE_DESCRIPTION_PRIORITY) {
    const row = forParticipant.find((s) => s.description === description);
    const goals = row?.score?.goals;
    if (typeof goals === "number" && Number.isFinite(goals)) return goals;
  }

  for (const row of forParticipant) {
    const goals = row.score?.goals;
    if (typeof goals === "number" && Number.isFinite(goals)) return goals;
  }

  return null;
}
