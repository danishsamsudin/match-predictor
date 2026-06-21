"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NationalTeamFlag } from "@/components/world-cup/NationalTeamFlag";
import type { HubCardPrediction } from "@/lib/world-cup/hub-prediction";
import type { MatchPhase } from "@/lib/world-cup/match-kickoff";
import { buildNationalPredictorUrl } from "@/lib/world-cup/predictor-prefill";
import { formatWcVenueKickoff } from "@/lib/world-cup/match-kickoff";
import { buildGuardedScoreMatrix } from "@/lib/world-cup/score-grid";
import {
  computeOutcomeEdges,
  type OutcomeEdgeRow,
} from "@/lib/world-cup/value-matrix";
import type { OutcomeOdds } from "@/lib/prediction/odds-value";

const STORAGE_PREFIX = "wc-book-odds:";
const HIGH_ALTITUDE_M = 1500;

function parseOdds(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 1 ? n : null;
}

export type UpcomingMatchCardProps = {
  matchId: string;
  homeName: string;
  awayName: string;
  groupCode: string | null;
  venueCity: string | null;
  venueStadium?: string | null;
  venueAltitude: number | null;
  matchDate: string | null;
  matchTime: string | null;
  matchPhase: MatchPhase;
  homeGoals: number | null;
  awayGoals: number | null;
  homeFifaRank: number | null;
  homeFifaPoints: number | null;
  awayFifaRank: number | null;
  awayFifaPoints: number | null;
  cardPrediction: HubCardPrediction | null;
};

export function MatchValueFlipCard(props: UpcomingMatchCardProps) {
  const {
    matchId,
    homeName,
    awayName,
    groupCode,
    venueCity,
    venueStadium,
    venueAltitude,
    matchDate,
    matchTime,
    matchPhase,
    homeFifaRank,
    homeFifaPoints,
    awayFifaRank,
    awayFifaPoints,
    cardPrediction,
  } = props;

  const [flipped, setFlipped] = useState(false);
  const [homeOdds, setHomeOdds] = useState("");
  const [drawOdds, setDrawOdds] = useState("");
  const [awayOdds, setAwayOdds] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${matchId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OutcomeOdds;
      if (parsed.home) setHomeOdds(String(parsed.home));
      if (parsed.draw) setDrawOdds(String(parsed.draw));
      if (parsed.away) setAwayOdds(String(parsed.away));
    } catch {
      /* ignore */
    }
  }, [matchId]);

  useEffect(() => {
    const h = parseOdds(homeOdds);
    const d = parseOdds(drawOdds);
    const a = parseOdds(awayOdds);
    if (h && d && a) {
      localStorage.setItem(
        `${STORAGE_PREFIX}${matchId}`,
        JSON.stringify({ home: h, draw: d, away: a })
      );
    }
  }, [matchId, homeOdds, drawOdds, awayOdds]);

  const hasBookInput = useMemo(() => {
    return (
      parseOdds(homeOdds) != null &&
      parseOdds(drawOdds) != null &&
      parseOdds(awayOdds) != null
    );
  }, [homeOdds, drawOdds, awayOdds]);

  const edges: OutcomeEdgeRow[] | null = useMemo(() => {
    if (!cardPrediction || !hasBookInput) return null;
    const h = parseOdds(homeOdds)!;
    const d = parseOdds(drawOdds)!;
    const a = parseOdds(awayOdds)!;
    return computeOutcomeEdges(
      {
        home: cardPrediction.home_win_pct,
        draw: cardPrediction.draw_pct,
        away: cardPrediction.away_win_pct,
      },
      { home: h, draw: d, away: a }
    );
  }, [cardPrediction, hasBookInput, homeOdds, drawOdds, awayOdds]);

  const snapshot = cardPrediction?.snapshot;
  const altitude = venueAltitude ?? 0;
  const highAltitude = altitude > HIGH_ALTITUDE_M;
  const kickoffVenueLabel = venueCity ?? venueStadium ?? null;
  const kickoff = formatWcVenueKickoff({
    date: matchDate,
    time: matchTime,
    venueCity: kickoffVenueLabel,
    homeName,
    awayName,
  });
  const predictorUrl = buildNationalPredictorUrl({
    homeName,
    awayName,
    city: kickoffVenueLabel,
    date: matchDate,
    time: matchTime,
    worldCupFixture: true,
  });

  const venueLine =
    venueStadium && venueCity && venueStadium !== venueCity
      ? `${venueStadium} · ${venueCity}`
      : venueCity ?? venueStadium ?? null;

  const homeWinPct = cardPrediction ? cardPrediction.home_win_pct * 100 : null;
  const drawPct = cardPrediction ? cardPrediction.draw_pct * 100 : null;
  const awayWinPct = cardPrediction ? cardPrediction.away_win_pct * 100 : null;
  const favoriteSide =
    cardPrediction && homeWinPct != null && awayWinPct != null
      ? homeWinPct > awayWinPct
        ? "home"
        : awayWinPct > homeWinPct
          ? "away"
          : null
      : null;

  const predScore =
    cardPrediction &&
    Number.isFinite(cardPrediction.predicted_score_home) &&
    Number.isFinite(cardPrediction.predicted_score_away)
      ? `${cardPrediction.predicted_score_home}-${cardPrediction.predicted_score_away}`
      : null;

  const overPct = cardPrediction?.over_2_5_pct;
  const underPct = cardPrediction?.under_2_5_pct;

  const modelExtras = useMemo(() => {
    if (!snapshot) return null;
    const lambda = Number(snapshot.lambda ?? snapshot.home_xg);
    const mu = Number(snapshot.mu ?? snapshot.away_xg);
    if (!Number.isFinite(lambda) || !Number.isFinite(mu)) return null;

    const storedBtts = Number(snapshot.btts_pct);
    if (Number.isFinite(storedBtts)) {
      const rho = Number(snapshot.rho);
      return {
        lambda,
        mu,
        rho: Number.isFinite(rho) ? rho : null,
        totalXg: lambda + mu,
        btts: storedBtts,
      };
    }

    const rho = Number(snapshot.rho);
    const scenario = String(snapshot.scenario ?? "");
    const mutualDraw = scenario.includes("mutual_draw");
    if (!Number.isFinite(rho)) return null;

    const { cells } = buildGuardedScoreMatrix(lambda, mu, rho, mutualDraw);
    const btts =
      cells.reduce(
        (sum, c) => (c.home > 0 && c.away > 0 ? sum + c.probability : sum),
        0
      ) * 100;

    return {
      lambda,
      mu,
      rho,
      totalXg: lambda + mu,
      btts,
    };
  }, [snapshot]);

  const fifaExtras = useMemo(() => {
    if (modelExtras) return null;
    const rankGap =
      homeFifaRank != null && awayFifaRank != null
        ? Math.abs(homeFifaRank - awayFifaRank)
        : null;
    const pointsGap =
      homeFifaPoints != null && awayFifaPoints != null
        ? Math.abs(homeFifaPoints - awayFifaPoints)
        : null;
    if (rankGap == null && pointsGap == null) return null;
    return { rankGap, pointsGap };
  }, [modelExtras, homeFifaRank, awayFifaRank, homeFifaPoints, awayFifaPoints]);

  return (
    <div className="wc-flip-scene h-full w-full">
      <div className={`wc-flip-inner ${flipped ? "is-flipped" : ""}`}>
        <div className="wc-flip-face wc-flip-front liquid-glass-pill">
          <header className="wc-card-header">
            <span className="text-xs font-bold tabular-nums text-slate-500">
              {kickoff ?? ""}
            </span>
            {groupCode ? (
              <span className="wc-card-badge">Group {groupCode}</span>
            ) : (
              <span />
            )}
            {cardPrediction?.locked ? (
              <span className="text-[9px] font-semibold text-slate-500">Locked</span>
            ) : (
              <span />
            )}
          </header>

          <div className="wc-card-matchup">
            <TeamColumn
              name={homeName}
              side="home"
              fifaRank={homeFifaRank}
              fifaPoints={homeFifaPoints}
            />
            <div className="wc-card-center">
              <span className="wc-card-vs">vs</span>
            </div>
            <TeamColumn
              name={awayName}
              side="away"
              fifaRank={awayFifaRank}
              fifaPoints={awayFifaPoints}
            />
          </div>

          {(homeWinPct != null || drawPct != null || awayWinPct != null) && (
            <div className="wc-card-win-row">
              <WinPctCell
                label="Home"
                pct={homeWinPct}
                isFavorite={favoriteSide === "home"}
              />
              <WinPctCell
                label="Draw"
                pct={drawPct}
                isFavorite={false}
                muted
              />
              <WinPctCell
                label="Away"
                pct={awayWinPct}
                isFavorite={favoriteSide === "away"}
              />
            </div>
          )}

          <div className="wc-card-stats-grid">
            <StatCell
              label="Pred. score"
              value={predScore ?? (cardPrediction ? "..." : "-")}
              highlight={Boolean(predScore)}
            />
            <StatCell
              label="Over 2.5"
              value={
                overPct != null && Number.isFinite(overPct)
                  ? `${(overPct * 100).toFixed(0)}%`
                  : cardPrediction
                    ? "..."
                    : "-"
              }
            />
            <StatCell
              label="Under 2.5"
              value={
                underPct != null && Number.isFinite(underPct)
                  ? `${(underPct * 100).toFixed(0)}%`
                  : cardPrediction
                    ? "..."
                    : "-"
              }
            />
            <StatCell
              label="Altitude"
              value={`${altitude}m`}
              warn={highAltitude}
            />
          </div>

          {venueLine && (
            <p className="wc-card-venue" title={venueLine}>
              {venueLine}
            </p>
          )}

          {cardPrediction ? (
            <div className="wc-card-odds-row">
              <OddsChip label="H" value={cardPrediction.fair_odds_home} />
              <OddsChip label="D" value={cardPrediction.fair_odds_draw} />
              <OddsChip label="A" value={cardPrediction.fair_odds_away} />
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500">
              Model line pending daily sync
            </p>
          )}

          {modelExtras ? (
            <div className="wc-card-extra-stats">
              <StatCell label="H xG" value={modelExtras.lambda.toFixed(2)} />
              <StatCell label="A xG" value={modelExtras.mu.toFixed(2)} />
              <StatCell label="BTTS" value={`${modelExtras.btts.toFixed(0)}%`} />
              <StatCell label="Σ xG" value={modelExtras.totalXg.toFixed(2)} />
            </div>
          ) : fifaExtras ? (
            <div className="wc-card-extra-stats">
              <StatCell
                label="Rank Δ"
                value={fifaExtras.rankGap != null ? String(fifaExtras.rankGap) : "-"}
              />
              <StatCell
                label="Pts Δ"
                value={
                  fifaExtras.pointsGap != null
                    ? Math.round(fifaExtras.pointsGap).toLocaleString()
                    : "-"
                }
              />
              <StatCell
                label="H FIFA"
                value={homeFifaRank != null ? `#${homeFifaRank}` : "-"}
              />
              <StatCell
                label="A FIFA"
                value={awayFifaRank != null ? `#${awayFifaRank}` : "-"}
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="wc-card-flip-btn w-full"
          >
            Odds &amp; value
          </button>
        </div>

        <div className="wc-flip-face wc-flip-back liquid-glass-pill">
          <header className="wc-card-back-header">
            <NationalTeamFlag teamName={homeName} side="home" size="card-sm" />
            <span className="wc-card-vs">vs</span>
            <NationalTeamFlag teamName={awayName} side="away" size="card-sm" />
          </header>

          <div className="wc-card-back-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
            {cardPrediction ? (
              <>
                {cardPrediction.locked && (
                  <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                    Pre-kickoff model (locked)
                  </p>
                )}

                <div className="wc-back-prob-bars">
                  <ProbBar label="Home" pct={homeWinPct ?? 0} tone="home" />
                  <ProbBar label="Draw" pct={drawPct ?? 0} tone="draw" />
                  <ProbBar label="Away" pct={awayWinPct ?? 0} tone="away" />
                </div>

                <div className="wc-back-metrics">
                  <BackMetric label="Pred. score" value={predScore ?? "-"} />
                  <BackMetric
                    label="Over 2.5"
                    value={
                      overPct != null ? `${(overPct * 100).toFixed(1)}%` : "-"
                    }
                  />
                  <BackMetric
                    label="Under 2.5"
                    value={
                      underPct != null ? `${(underPct * 100).toFixed(1)}%` : "-"
                    }
                  />
                  <BackMetric label="Altitude" value={`${altitude}m`} warn={highAltitude} />
                </div>

                {snapshot && (
                  <div className="wc-back-model-detail">
                    <p>
                      xG λ {formatNum(snapshot.lambda ?? snapshot.home_xg)} · μ{" "}
                      {formatNum(snapshot.mu ?? snapshot.away_xg)}
                      {Number.isFinite(Number(snapshot.rho)) && (
                        <> · ρ {formatNum(snapshot.rho)}</>
                      )}
                    </p>
                    {snapshot.source === "graham-wc-hub" && (
                      <p>
                        ΔS {formatNum(snapshot.delta_s)} · R_xG{" "}
                        {formatNum(snapshot.home_xg_elo)}/{formatNum(snapshot.away_xg_elo)} · WCTR{" "}
                        {formatNum(snapshot.home_wctr)}/{formatNum(snapshot.away_wctr)}
                      </p>
                    )}
                    {snapshot.source === "graham-wc-hub" && (
                      <p>
                        A/D {formatNum(snapshot.home_attack)}/{formatNum(snapshot.home_defense)} vs{" "}
                        {formatNum(snapshot.away_attack)}/{formatNum(snapshot.away_defense)} · SCI{" "}
                        {formatNum(snapshot.home_sci)}/{formatNum(snapshot.away_sci)} · SSI{" "}
                        {formatNum(snapshot.home_ssi)}/{formatNum(snapshot.away_ssi)}
                      </p>
                    )}
                    <p>
                      {snapshot.source === "graham-wc-hub"
                        ? `Model: ${String(snapshot.scenario ?? "wc-graham-v1.0")}`
                        : snapshot.source === "main-predict"
                          ? `Model: ${String(snapshot.scenario ?? "main predict")}`
                          : `Scenario: ${String(snapshot.scenario ?? "standard")}`}
                      {snapshot.source === "graham-wc-hub" &&
                        Boolean(snapshot.home_form_fallback || snapshot.away_form_fallback) && (
                          <> · fallback: {String(snapshot.home_form_fallback ?? snapshot.away_form_fallback)}</>
                        )}
                      {highAltitude && snapshot.source !== "main-predict" && snapshot.source !== "graham-wc-hub" && (
                        <>
                          {" "}
                          · λ atten. {String(snapshot.lambda_attenuation_pct ?? "-")}%
                        </>
                      )}
                    </p>
                  </div>
                )}

                <p className="mb-2 text-[10px] leading-snug text-slate-500">
                  Dixon-Coles fair odds - enter book prices for +EV.
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <OddsField
                    label="Home"
                    value={homeOdds}
                    onChange={setHomeOdds}
                    placeholder={
                      Number.isFinite(cardPrediction.fair_odds_home)
                        ? cardPrediction.fair_odds_home.toFixed(2)
                        : "-"
                    }
                  />
                  <OddsField
                    label="Draw"
                    value={drawOdds}
                    onChange={setDrawOdds}
                    placeholder={
                      Number.isFinite(cardPrediction.fair_odds_draw)
                        ? cardPrediction.fair_odds_draw.toFixed(2)
                        : "-"
                    }
                  />
                  <OddsField
                    label="Away"
                    value={awayOdds}
                    onChange={setAwayOdds}
                    placeholder={
                      Number.isFinite(cardPrediction.fair_odds_away)
                        ? cardPrediction.fair_odds_away.toFixed(2)
                        : "-"
                    }
                  />
                </div>

                <div className="wc-card-odds-row mt-2">
                  <OddsChip label="H" value={cardPrediction.fair_odds_home} />
                  <OddsChip label="D" value={cardPrediction.fair_odds_draw} />
                  <OddsChip label="A" value={cardPrediction.fair_odds_away} />
                </div>

                {hasBookInput && edges ? (
                  <table className="mt-2 w-full text-[10px]">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="pb-0.5">Sel.</th>
                        <th>Model</th>
                        <th>+EV</th>
                        <th>Disc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {edges.map((row) => (
                        <tr key={row.label}>
                          <td className="py-0.5 font-medium">{row.label}</td>
                          <td className="py-0.5 tabular-nums">{row.modelPct.toFixed(1)}%</td>
                          <td
                            className={`py-0.5 font-semibold tabular-nums ${
                              row.actionable ? "text-emerald-600 dark:text-emerald-400" : ""
                            }`}
                          >
                            {row.rawBetEdgePct >= 0 ? "+" : ""}
                            {row.rawBetEdgePct.toFixed(1)}%
                          </td>
                          <td
                            className={`py-0.5 tabular-nums ${
                              row.actionable ? "text-emerald-600 dark:text-emerald-400" : ""
                            }`}
                          >
                            {row.pureLineDiscrepancyPp >= 0 ? "+" : ""}
                            {row.pureLineDiscrepancyPp.toFixed(1)}pp
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-[10px] text-slate-500">
                    Enter all three decimal odds to compare +EV.
                  </p>
                )}

                <div className="wc-back-fifa-row">
                  <span>
                    {homeName}: FIFA #{homeFifaRank ?? "-"}
                  </span>
                  <span>
                    {awayName}: FIFA #{awayFifaRank ?? "-"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs leading-snug text-slate-500">
                No hub model line yet. Run the World Cup sync cron, or open the predictor
                for a full match prediction.
              </p>
            )}

            <div className="mt-auto space-y-2 pt-3">
              {predictorUrl ? (
                <Link
                  href={predictorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-semibold text-cyan-700 underline dark:text-cyan-400"
                >
                  Open in predictor
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setFlipped(false)}
                className="wc-card-flip-btn w-full"
                aria-label="Flip to match summary"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNum(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

function TeamColumn({
  name,
  side,
  fifaRank,
  fifaPoints,
}: {
  name: string;
  side: "home" | "away";
  fifaRank: number | null;
  fifaPoints: number | null;
}) {
  return (
    <div className={`wc-team-col ${side === "home" ? "wc-team-col-home" : "wc-team-col-away"}`}>
      <NationalTeamFlag teamName={name} side={side} />
      <p className="wc-team-name" title={name}>
        {name}
      </p>
      {fifaRank != null && (
        <p className="wc-team-fifa">
          FIFA #{fifaRank}
          {fifaPoints != null && (
            <span className="text-slate-500"> · {Math.round(fifaPoints)}pts</span>
          )}
        </p>
      )}
    </div>
  );
}

function WinPctCell({
  label,
  pct,
  isFavorite,
  muted,
}: {
  label: string;
  pct: number | null;
  isFavorite: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`wc-win-pct-cell ${muted ? "wc-win-pct-cell-muted" : ""}`}>
      <span className="wc-win-pct-label">{label}</span>
      <span
        className={`wc-win-pct-value ${isFavorite ? "wc-win-pct-value-fav" : ""}`}
      >
        {pct != null ? `${pct.toFixed(0)}%` : "-"}
      </span>
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`wc-stat-cell ${highlight ? "wc-stat-cell-highlight" : ""} ${warn ? "wc-stat-cell-warn" : ""}`}
    >
      <span className="wc-stat-label">{label}</span>
      <span className="wc-stat-value">{value}</span>
    </div>
  );
}

function BackMetric({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={`wc-back-metric ${warn ? "wc-stat-cell-warn" : ""}`}>
      <span className="wc-stat-label">{label}</span>
      <span className="wc-stat-value">{value}</span>
    </div>
  );
}

function ProbBar({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "home" | "draw" | "away";
}) {
  return (
    <div className="wc-prob-bar">
      <div className="flex justify-between text-[9px] font-semibold text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums text-slate-700 dark:text-slate-200">{pct.toFixed(1)}%</span>
      </div>
      <div className="wc-prob-bar-track">
        <div
          className={`wc-prob-bar-fill wc-prob-bar-fill-${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function OddsChip({ label, value }: { label: string; value?: number }) {
  return (
    <div className="wc-odds-chip">
      <span className="wc-odds-chip-label">{label}</span>
      <span className="wc-odds-chip-value">
        {value != null && Number.isFinite(value) ? value.toFixed(2) : "-"}
      </span>
    </div>
  );
}

function OddsField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="mt-0.5 w-full rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 text-xs tabular-nums dark:border-slate-600 dark:bg-slate-900/80"
      />
    </label>
  );
}
