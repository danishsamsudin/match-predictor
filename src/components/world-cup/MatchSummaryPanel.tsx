"use client";

import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import { InfoTip } from "@/components/ui/InfoTip";
import type { WcMatchSummary, WcMatchSummaryStat } from "@/lib/world-cup/match-summary";
import {
  WC_MATCH_SUMMARY_SOURCE_INFO,
  WC_MATCH_SUMMARY_STAT_GLOSSARY,
  WC_MATCH_SUMMARY_STAT_GROUPS,
} from "@/lib/world-cup/match-summary-stat-glossary";

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
  return Math.max(6, Math.min(94, share * 100));
}

function statInfo(stat: WcMatchSummaryStat) {
  return WC_MATCH_SUMMARY_STAT_GLOSSARY[stat.key] ?? null;
}

function StatLabel({
  stat,
  className = "",
}: {
  stat: WcMatchSummaryStat;
  className?: string;
}) {
  const info = statInfo(stat);
  return (
    <span className={`wc-match-summary-stat-label ${className}`.trim()}>
      <span>{stat.label}</span>
      {info ? (
        <InfoTip label={`What is ${stat.label}?`} side="bottom" size="sm">
          {info}
        </InfoTip>
      ) : null}
    </span>
  );
}

function ComparisonBar({
  stat,
  homeName,
  awayName,
  homeLabel,
  awayLabel,
  homeWidth,
  awayWidth,
  className = "",
}: {
  stat: WcMatchSummaryStat;
  homeName: string;
  awayName: string;
  homeLabel: string;
  awayLabel: string;
  homeWidth: number;
  awayWidth: number;
  className?: string;
}) {
  return (
    <div
      className={`wc-match-summary-stat-bar ${className}`.trim()}
      role="img"
      aria-label={`${stat.label}: ${homeName} ${homeLabel}, ${awayName} ${awayLabel}`}
    >
      <span className="wc-match-summary-stat-bar-home" style={{ width: `${homeWidth}%` }} />
      <span className="wc-match-summary-stat-bar-away" style={{ width: `${awayWidth}%` }} />
    </div>
  );
}

function FeaturedStatCard({
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
    <div className="wc-match-summary-featured-card">
      <StatLabel stat={stat} className="wc-match-summary-featured-label" />
      <div className="wc-match-summary-featured-values">
        <span className="wc-match-summary-stat-value wc-match-summary-stat-value-home wc-match-summary-stat-value-featured">
          {homeLabel}
        </span>
        <span className="wc-match-summary-stat-value wc-match-summary-stat-value-away wc-match-summary-stat-value-featured">
          {awayLabel}
        </span>
      </div>
      <ComparisonBar
        stat={stat}
        homeName={homeName}
        awayName={awayName}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
        homeWidth={homeWidth}
        awayWidth={awayWidth}
        className="wc-match-summary-stat-bar-featured"
      />
    </div>
  );
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
        <StatLabel stat={stat} />
        <span className="wc-match-summary-stat-value wc-match-summary-stat-value-away">
          {awayLabel}
        </span>
      </div>
      <ComparisonBar
        stat={stat}
        homeName={homeName}
        awayName={awayName}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
        homeWidth={homeWidth}
        awayWidth={awayWidth}
      />
    </div>
  );
}

function groupSummaryStats(stats: WcMatchSummaryStat[]) {
  const byKey = new Map(stats.map((stat) => [stat.key, stat]));
  const groupedKeys = new Set<string>();

  const sections = WC_MATCH_SUMMARY_STAT_GROUPS.map((group) => {
    const groupStats = group.keys
      .map((key) => byKey.get(key))
      .filter((stat): stat is WcMatchSummaryStat => stat != null);
    for (const stat of groupStats) groupedKeys.add(stat.key);
    return { ...group, stats: groupStats };
  }).filter((group) => group.stats.length > 0);

  const remaining = stats.filter((stat) => !groupedKeys.has(stat.key));
  if (remaining.length > 0) {
    sections.push({
      id: "other",
      title: "Other",
      keys: remaining.map((stat) => stat.key),
      stats: remaining,
    });
  }

  const featured = sections.find((section) => section.id === "featured");
  const detailSections = sections.filter((section) => section.id !== "featured");

  return { featured: featured?.stats ?? [], detailSections };
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

  const { featured, detailSections } = groupSummaryStats(summary.stats);

  return (
    <div className="wc-match-summary liquid-glass-pill rounded-xl px-5 py-5 sm:px-6">
      <div className="wc-match-summary-scoreboard">
        <div className="wc-match-summary-team wc-match-summary-team-home">
          <NationalTeamFlag teamName={homeName} side="home" size="lg" />
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
          <NationalTeamFlag teamName={awayName} side="away" size="lg" />
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

      {summary.stats.length > 0 && (
        <div className="wc-match-summary-body">
          <div className="wc-match-summary-stats-header">
            <h4 className="wc-match-summary-stats-title">Match statistics</h4>
            <InfoTip label="Where do these match statistics come from?" side="bottom">
              {WC_MATCH_SUMMARY_SOURCE_INFO}
            </InfoTip>
          </div>

          {featured.length > 0 && (
            <div className="wc-match-summary-featured">
              {featured.map((stat) => (
                <FeaturedStatCard
                  key={stat.key}
                  stat={stat}
                  homeName={homeName}
                  awayName={awayName}
                />
              ))}
            </div>
          )}

          {detailSections.map((section) => (
            <section key={section.id} className="wc-match-summary-section" aria-label={section.title}>
              <h5 className="wc-match-summary-section-title">{section.title}</h5>
              <div className="wc-match-summary-stats">
                {section.stats.map((stat) => (
                  <StatRow key={stat.key} stat={stat} homeName={homeName} awayName={awayName} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
