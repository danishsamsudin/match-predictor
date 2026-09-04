/**
 * Plain-language glossary for GLPM Insights / Contextual Extension UI.
 * Every chart InfoTip should pull from here so copy stays consistent.
 */

export type GlossaryEntry = {
  /** Short title for the tip */
  label: string;
  /** What the chart shows */
  what: string;
  /** How the number is collected or calculated */
  how: string;
  /** Optional honesty note (proxies, sample size, etc.) */
  caveat?: string;
};

export const GLPM_CX_GLOSSARY = {
  modelBadge: {
    label: "GLPM vs GLPM-CX",
    what: "GLPM is the locked club model (ratings → xG → Dixon–Coles). GLPM-CX is a separate Contextual Extension that starts from that base and adjusts for rest, travel, altitude, weather, and lineup.",
    how: "CX never retrains the seven rating engines or changes GLPM interaction weights. It multiplies base expected goals, then re-runs Dixon–Coles only.",
  },
  homeAwayXg: {
    label: "Expected goals (xG)",
    what: "Model projection of how many goals each side is expected to score in this matchup.",
    how: "GLPM combines the seven primary ratings through a fixed interaction matrix and home advantage. CX may then scale those λ values with context multipliers.",
    caveat:
      "For 2025/26 SportMonks seasons, many training rows use shot-based xG proxies when provider xG is missing. Ratings still train, but treat absolute xG as an estimate.",
  },
  winProbDonut: {
    label: "Match winner probabilities (1X2)",
    what: "Chance of home win, draw, or away win according to the selected model.",
    how: "Summed from the Dixon–Coles score probability matrix generated from home and away xG.",
  },
  fairOdds: {
    label: "Model fair odds",
    what: "Decimal odds implied by the model probability with no bookmaker margin.",
    how: "Fair odds = 1 / model probability. Compare with book prices to spot value.",
  },
  scoreHeatmap: {
    label: "Score probability matrix",
    what: "Probability of each exact scoreline from 0-0 through 4-4. Cells with 5 or more goals are grouped as a remainder.",
    how: "Dixon-Coles adjustment on independent Poisson goal counts from each side's xG. The engine still computes a larger grid internally so 1X2 and totals are not truncated.",
  },
  primaryRadar: {
    label: "Primary rating radar (0–100)",
    what: "Side-by-side profile of the seven GLPM latent skills.",
    how: "Attack, Defence, Goalkeeper, Build-up, Possession, Pressing, and Finishing are trained per season and calibrated to a 0–100 scale (center ~60).",
  },
  domainBars: {
    label: "Domain breakdown",
    what: "Attack, defence, and goalkeeper sub-skills on the 0-100 scale. Home is left, away is right.",
    how: "Loaded from glpm_team_domain_ratings produced by the rating trainers. Display-only; not re-fit at predict time.",
    caveat:
      "A domain is hidden when every club is scored 100. That happens when the training feature had no variance, most often because shot-level set-piece flags are missing.",
  },
  componentGauge: {
    label: "Component ratings",
    what: "Finer latent scores such as set-piece threat or box protection.",
    how: "Stored in glpm_team_component_ratings from the same training pipelines as the primaries.",
  },
  setPieceGauge: {
    label: "Set-piece matchup",
    what: "How one side's set-piece attack compares with the other's set-piece defence.",
    how: "Compares component ratings set_piece_threat vs set_piece_defence when both are available.",
    caveat:
      "If every club lands on 100, the trainer had no set-piece shot tags to learn from. That is missing data, not a real 100 vs 100 matchup.",
  },
  interactions: {
    label: "Matchup interactions (Δ)",
    what: "How each side’s strengths clash with the opponent’s weaknesses before goals are projected.",
    how: "Fixed GLPM weights: Attack–Defence 40%, Finishing–GK 25%, Build-up–Pressing 20%, Possession–Pressing 15%.",
  },
  styleBadges: {
    label: "Tactical style labels",
    what: "Descriptive style tags such as high press or low block.",
    how: "Threshold rules on season averages (possession, PPDA, directness) from style snapshots or match stats.",
    caveat:
      "PPDA here is a SportMonks proxy (opponent passes divided by tackles, interceptions, and clearances), not Wyscout event PPDA.",
  },
  styleMatchup: {
    label: "Style confrontation",
    what: "How the two tactical profiles clash. Pills are season style labels; possession and PPDA sit underneath.",
    how: "Labels and averages come from glpm_team_style_snapshots when present, otherwise season averages of possession_pct and ppda on glpm_match_team_stats.",
  },
  vsStyleLift: {
    label: "Performance vs opponent style",
    what: "How much more or less xG a team tends to create against a given opponent style.",
    how: "Aggregated from glpm_match_vs_style rows (match xG tagged by opponent style labels).",
    caveat: "Small sample sizes make lifts noisy. Proxy xG seasons need extra caution.",
  },
  overUnder: {
    label: "Over / Under goals",
    what: "Probability that total goals land over or under each line.",
    how: "Derived from the full score matrix for lines 0.5–4.5.",
  },
  btts: {
    label: "Both teams to score",
    what: "Chance both sides score at least once.",
    how: "Sum of matrix cells where home goals ≥ 1 and away goals ≥ 1.",
  },
  asianHandicap: {
    label: "Asian handicap",
    what: "Cover probabilities for common handicap lines from the home perspective.",
    how: "Derived from the score matrix margins (including half and quarter lines). Presentation only - not a separate rating model.",
  },
  doubleChance: {
    label: "Double chance",
    what: "Three combined 1X2 bets: Home or Draw (1X), either team wins (12), and Draw or Away (X2). The 12 market is home or away - it wins unless the match is a draw.",
    how: "Sums of the corresponding 1X2 outcomes from the score matrix.",
  },
  teamTotals: {
    label: "Team goal totals",
    what: "Probability each team scores over/under a goal line.",
    how: "Marginal sums of the score matrix for that side’s goals.",
  },
  valueEdge: {
    label: "Expected value (+EV)",
    what: "Whether a book price is longer than the model’s fair odds.",
    how: "Edge = (model probability × book decimal odds) − 1. Enter book odds manually; no live scrape in v1.",
  },
  restCongestion: {
    label: "Rest days",
    what: "How many days each team typically has between matches. Under 3 days is congestion; a 7-day gap is the baseline. Extra rest above 7 days does not increase xG.",
    how: "For a real fixture, CX counts days since the last finished match. For a team-vs-team compare with no kickoff, rest is estimated from recent match spacing in the selected season so off-season gaps (80-120 days) are not treated as match rest.",
  },
  travel: {
    label: "Travel distance",
    what: "Approximate kilometres travelled to the venue.",
    how: "Haversine distance between team/venue coordinates when available. Long trips apply a mild CX goals penalty.",
  },
  altitude: {
    label: "Venue altitude",
    what: "Whether the pitch altitude may disadvantage the away side.",
    how: "Uses glpm_venues.altitude_m when present. Above the CX threshold, only the away λ is scaled.",
  },
  weather: {
    label: "Weather context",
    what: "Forecast conditions at the home venue around kickoff.",
    how: "Open-Meteo forecast (same source as hub weather). CX may nudge total goals for heavy rain or high wind.",
    caveat: "Weather is contextual display + CX only. Frozen GLPM predictions ignore weather.",
  },
  lineupImpact: {
    label: "Lineup availability impact",
    what: "How confirmed or missing key players nudge each side’s expected goals.",
    how: "Club-simplified CX model using recent minutes / goals / assists from available player rows and GK ratings when present. Unknown XI → multiplier 1.0 (provisional).",
  },
  xgWaterfall: {
    label: "Base xG to CX-adjusted xG",
    what: "Five context multipliers (rest, travel, altitude, weather, lineup) scale base xG. 1.000 means that factor does not move the projection.",
    how: "Starts from frozen GLPM xG, then multiplies rest, travel, altitude, weather, and lineup independently per side. Typical PL compares with ~7 days rest, travel under 500 km, and no confirmed XI stay at 1.000 on every factor.",
  },
  finishingDelta: {
    label: "Finishing differential (Goals vs xG)",
    what: "Season goals compared with season xG. Positive means the team scored more than the chances they created.",
    how: "For Premier League 2025/26 this uses Understat season totals (goals and xG). Other seasons use match-level xG when it is not a shot-based proxy.",
    caveat:
      "Shot-based proxy xG on glpm_match_team_stats is not used when Understat season xG is available. The Finishing radar axis is a separate trained rating.",
  },
  cornersCards: {
    label: "Corners and cards (satellite)",
    what: "Expected corners and bookings for the match.",
    how: "Uses 2025/26 team rates until the current season has 20 finished matches (same n as Bayesian rating confidence). After that floor, empirical-Bayes shrinkage trains on current-season labeled corners/cards. Does not feed GLPM ratings.",
  },
  playerProps: {
    label: "Player shots / SoT props (satellite)",
    what: "Simple shot and shot-on-target lines for outfield players.",
    how: "Minutes-weighted rates from the stats season (prior season until 20 current-season results). Satellite only - not part of GLPM.",
  },
  seasonSim: {
    label: "Season Monte Carlo outrights",
    what: "Title, top-four, and relegation chances from simulating remaining fixtures.",
    how: "Repeated draws of match outcomes from GLPM or CX 1X2 probabilities. Does not retrain ratings.",
  },
  proxyHonesty: {
    label: "Data quality (2025/26)",
    what: "Many SportMonks-only league runs lack provider xG and Wyscout PPDA.",
    how: "Training fills shot-based xG proxies and defensive-action PPDA proxies, flagged in sync metadata. Insights prefer ratings over raw proxy volumes when explaining quality.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLPM_CX_GLOSSARY;

export function glossaryTipBody(key: GlossaryKey): string {
  const e: GlossaryEntry = GLPM_CX_GLOSSARY[key];
  const parts = [`${e.what}`, `How: ${e.how}`];
  if (e.caveat) parts.push(`Note: ${e.caveat}`);
  return parts.join(" ");
}
