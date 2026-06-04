import type { MatchPhase } from "@/lib/world-cup/match-kickoff";

export function MatchOutcomeStrip({
  phase,
  homeName,
  awayName,
  homeGoals,
  awayGoals,
}: {
  phase: MatchPhase;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}) {
  if (phase === "pre") return null;

  const hasScore = homeGoals != null && awayGoals != null;
  const label = phase === "finished" ? "Final" : "Live";

  return (
    <p
      className={`wc-outcome-strip ${phase === "finished" ? "wc-outcome-strip-final" : "wc-outcome-strip-live"}`}
    >
      <span className="wc-outcome-strip-label">{label}</span>
      {hasScore ? (
        <span className="wc-outcome-strip-score">
          {homeName} {homeGoals}-{awayGoals} {awayName}
        </span>
      ) : (
        <span className="wc-outcome-strip-score">Score awaiting update</span>
      )}
    </p>
  );
}
