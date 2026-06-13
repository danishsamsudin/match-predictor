import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import type { WcMatchSummary, WcMatchSummaryStat } from "@/lib/world-cup/match-summary";

function formatStatValue(stat: WcMatchSummaryStat, side: "home" | "away"): string {
  const value = side === "home" ? stat.home : stat.away;
  if (value == null) return "—";
  if (stat.isPercent) return `${Math.round(value)}%`;
  if (stat.key === "xg") return value.toFixed(2);
  return String(value);
}

function statBarWidth(stat: WcMatchSummaryStat, side: "home" | "away"): number {
  const home = stat.home ?? 0;
  const away = stat.away ?? 0;
  const total = home + away;
  if (total <= 0) return 50;
  const share = side === "home" ? home / total : away / total;
  return Math.max(8, Math.min(92, share * 100));
}

function StatRow({
  stat,
  homeName,
  awayName,
}: {
  stat: WcMatchSummaryStat;
  homeName: string;
  awayName: string;
}) {
  const homeLabel = formatStatValue(stat, "home");
  const awayLabel = formatStatValue(stat, "away");
  const homeWidth = statBarWidth(stat, "home");
  const awayWidth = statBarWidth(stat, "away");

  return (
    <div className="wc-match-summary-stat">
      <div className="wc-match-summary-stat-header">
        <span className="wc-match-summary-stat-value wc-match-summary-stat-value-home">
          {homeLabel}
        </span>
        <span className="wc-match-summary-stat-label">{stat.label}</span>
        <span className="wc-match-summary-stat-value wc-match-summary-stat-value-away">
          {awayLabel}
        </span>
      </div>
      <div
        className="wc-match-summary-stat-bar"
        role="img"
        aria-label={`${stat.label}: ${homeName} ${homeLabel}, ${awayName} ${awayLabel}`}
      >
        <span
          className="wc-match-summary-stat-bar-home"
          style={{ width: `${homeWidth}%` }}
        />
        <span
          className="wc-match-summary-stat-bar-away"
          style={{ width: `${awayWidth}%` }}
        />
      </div>
    </div>
  );
}

export function MatchSummaryPanel({
  homeName,
  awayName,
  summary,
}: {
  homeName: string;
  awayName: string;
  summary: WcMatchSummary;
}) {
  const htLabel =
    summary.halfTimeHome != null && summary.halfTimeAway != null
      ? `HT ${summary.halfTimeHome}-${summary.halfTimeAway}`
      : null;

  return (
    <div className="wc-match-summary liquid-glass-pill rounded-xl p-4">
      <div className="wc-match-summary-scoreboard">
        <div className="wc-match-summary-team wc-match-summary-team-home">
          <NationalTeamFlag teamName={homeName} side="home" className="h-8 w-8" />
          <span className="wc-match-summary-team-name">{homeName}</span>
          {summary.homeFormation && (
            <span className="wc-match-summary-formation">{summary.homeFormation}</span>
          )}
        </div>
        <div className="wc-match-summary-score">
          <span className="wc-match-summary-score-main">
            {summary.homeGoals} – {summary.awayGoals}
          </span>
          {htLabel && <span className="wc-match-summary-ht">{htLabel}</span>}
        </div>
        <div className="wc-match-summary-team wc-match-summary-team-away">
          <NationalTeamFlag teamName={awayName} side="away" className="h-8 w-8" />
          <span className="wc-match-summary-team-name">{awayName}</span>
          {summary.awayFormation && (
            <span className="wc-match-summary-formation">{summary.awayFormation}</span>
          )}
        </div>
      </div>

      {(summary.venue || summary.referee) && (
        <p className="wc-match-summary-meta">
          {[summary.venue, summary.referee ? `Ref: ${summary.referee}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className="wc-match-summary-stats">
        {summary.stats.map((stat) => (
          <StatRow key={stat.key} stat={stat} homeName={homeName} awayName={awayName} />
        ))}
      </div>
    </div>
  );
}
