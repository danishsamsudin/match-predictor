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
    what: "Probability of each exact scoreline (home goals × away goals).",
    how: "Dixon–Coles adjustment on independent Poisson goal counts from each side’s xG.",
  },
  primaryRadar: {
    label: "Primary rating radar (0–100)",
    what: "Side-by-side profile of the seven GLPM latent skills.",
    how: "Attack, Defence, Goalkeeper, Build-up, Possession, Pressing, and Finishing are trained per season and calibrated to a 0–100 scale (center ~60).",
  },
  domainBars: {
    label: "Domain breakdown",
    what: "Sub-skills that roll up into each primary rating (e.g. Creation / Progression / Situational for Attack).",
    how: "Loaded from glpm_team_domain_ratings produced by the rating trainers. Display-only; not re-fit at predict time.",
  },
  componentGauge: {
    label: "Component ratings",
    what: "Finer latent scores such as set-piece threat or box protection.",
    how: "Stored in glpm_team_component_ratings from the same training pipelines as the primaries.",
  },
  setPieceGauge: {
    label: "Set-piece matchup",
    what: "How one side’s set-piece attack compares with the other’s set-piece defence.",
    how: "Compares component ratings set_piece_threat vs set_piece_defence when both are available.",
  },
  interactions: {
    label: "Matchup interactions (Δ)",
    what: "How each side’s strengths clash with the opponent’s weaknesses before goals are projected.",
    how: "Fixed GLPM weights: Attack–Defence 40%, Finishing–GK 25%, Build-up–Pressing 20%, Possession–Pressing 15%.",
  },
  styleBadges: {
    label: "Tactical style labels",
    what: "Descriptive style tags such as high press or low block.",
    how: "Threshold rules on season averages (possession, PPDA, directness, crosses, set-piece xG share) from glpm_team_style_snapshots.",
    caveat:
      "PPDA in SportMonks-only runs is often a proxy (opponent passes ÷ tackles + interceptions + clearances), not Wyscout event PPDA.",
  },
  styleMatchup: {
    label: "Style confrontation",
    what: "How the two teams’ style labels clash (e.g. high press vs low block).",
    how: "Heuristic pairing of each side’s style snapshot labels. Historical lift vs a style uses glpm_match_vs_style when populated.",
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
    what: "Combined 1X, 12, or X2 probabilities.",
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
    label: "Rest and congestion",
    what: "How many days since each team’s last match and whether the calendar is tight.",
    how: "CX counts days between fixtures in glpm_matches, then applies rest / congestion multipliers copied into the CX layer (not wired into frozen GLPM).",
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
    what: "Step-by-step effect of each CX multiplier on expected goals.",
    how: "Starts from frozen GLPM xG, then multiplies rest, travel, altitude, weather, and lineup factors independently per side.",
  },
  finishingDelta: {
    label: "Finishing differential (Goals − xG)",
    what: "Whether a team has scored more or fewer goals than their chances imply.",
    how: "Season sum of goals minus team-match xG (often proxy xG in 2025/26). Also reflected inside the Finishing primary via training targets.",
    caveat: "Proxy xG inflates noise in Goals − xG. Prefer the Finishing rating for skill signal.",
  },
  cornersCards: {
    label: "Corners and cards (satellite)",
    what: "Expected corners and bookings for the match.",
    how: "Separate satellite model under glpm-cx. Uses team averages (and ingested corner/card counts when present). Does not feed GLPM ratings.",
  },
  playerProps: {
    label: "Player shots / SoT props (satellite)",
    what: "Simple shot and shot-on-target lines for outfield players.",
    how: "Minutes-weighted rates from available player match stats. Satellite only - not part of GLPM.",
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
