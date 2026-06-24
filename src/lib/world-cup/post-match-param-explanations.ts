export interface ParamExplanation {
  label: string;
  whatItIs: string;
  ifIncreased: string;
  ifDecreased: string;
}

export const PARAM_EXPLANATIONS: Record<string, ParamExplanation> = {
  muXg: {
    label: "Baseline goals (μ)",
    whatItIs:
      "The model's neutral expected goals per team before strength gaps are applied — think of it as the typical scoring rate in this tournament.",
    ifIncreased:
      "Future matches get slightly higher expected goal totals; overs and BTTS lean up where teams are evenly matched.",
    ifDecreased:
      "Future matches get slightly lower expected totals; unders and 0-0/low-score draws gain a bit of weight.",
  },
  strengthExponent: {
    label: "Strength gap exponent",
    whatItIs:
      "How sharply a favourite's advantage turns into extra xG. Higher values make gaps between teams matter more.",
    ifIncreased:
      "Strong favourites are trusted more; upset probabilities shrink slightly for big mismatches.",
    ifDecreased:
      "Underdogs keep more chance; tight games and draws stay relatively more likely.",
  },
  momentumGamma: {
    label: "Momentum sensitivity",
    whatItIs:
      "How much recent winning/losing streaks nudge the next prediction beyond structural strength.",
    ifIncreased:
      "Hot teams get a bigger boost and cold teams a bigger penalty in upcoming fixtures.",
    ifDecreased:
      "Recent form matters less; ratings and long-run quality dominate.",
  },
  "deltaWeights.xgElo": {
    label: "xG-Elo weight",
    whatItIs: "How much our xG-based Elo rating gap moves the prediction.",
    ifIncreased: "Teams with better underlying chance creation/defence are favoured more.",
    ifDecreased: "Other signals (talent, FIFA rank, tournament form) matter relatively more.",
  },
  "deltaWeights.talent": {
    label: "Squad talent weight",
    whatItIs: "How much market-value / squad-quality gap affects the prediction.",
    ifIncreased: "Big-nation squads with depth are favoured more when xG is noisy.",
    ifDecreased: "On-pitch xG and tournament performance outweigh paper quality.",
  },
  "deltaWeights.tournament": {
    label: "Pre-tournament form weight",
    whatItIs: "How much qualifying / pre-WC form shifts the baseline strength gap.",
    ifIncreased: "Teams that arrived in strong qualifying form get more credit.",
    ifDecreased: "In-tournament evidence and xG-Elo dominate over pre-tournament runs.",
  },
  "deltaWeights.recentXgForm": {
    label: "In-tournament xG form weight",
    whatItIs: "How much each team's xG created/conceded in this World Cup adjusts the next match.",
    ifIncreased: "Teams riding a good xG run in the tournament are upgraded faster.",
    ifDecreased: "Structural ratings change more slowly; one-off xG swings matter less.",
  },
  "deltaWeights.fifa": {
    label: "FIFA ranking weight",
    whatItIs: "How much official FIFA rank gap nudges predictions.",
    ifIncreased: "Higher-ranked nations get a modest extra edge even when xG is close.",
    ifDecreased: "FIFA rank is mostly ignored; model leans on xG and tournament data.",
  },
  "deltaWeights.momentum": {
    label: "Momentum index weight",
    whatItIs: "How much the momentum index (results trajectory) shifts strength beyond xG-Elo.",
    ifIncreased: "Winning streaks and confidence effects show up more in the next prediction.",
    ifDecreased: "Results streaks are discounted; expected goals drive more of the call.",
  },
  wcAttackFormWeight: {
    label: "Attack form blend",
    whatItIs:
      "How much individual player attacking form in this tournament adjusts team expected goals.",
    ifIncreased: "In-form finishers and creators lift a team's attack projection more.",
    ifDecreased: "Team-level ratings dominate; individual hot streaks are faded.",
  },
  wcDefenseFormWeight: {
    label: "Defense form blend",
    whatItIs: "How much defensive player form adjusts goals conceded.",
    ifIncreased: "Solid defensive units suppress opponent xG more in upcoming games.",
    ifDecreased: "Defensive form is trusted less; structural defence ratings lead.",
  },
  wcFinishingRegressionWeight: {
    label: "Finishing regression",
    whatItIs:
      "How aggressively we pull over- or under-performing finishing back toward average xG.",
    ifIncreased: "Hot/cold finishing streaks are faded faster toward expected quality.",
    ifDecreased: "Actual goals scored/conceded recently influence projections longer.",
  },
  wcLineupAttackBlend: {
    label: "Lineup attack blend",
    whatItIs: "How much the projected starting XI's attack profile moves team xG.",
    ifIncreased: "Confirmed or projected lineups shift attacking expectations more.",
    ifDecreased: "Squad-level strength matters more than who starts.",
  },
  wcLineupDefenseBlend: {
    label: "Lineup defense blend",
    whatItIs: "How much the projected XI's defensive profile moves goals conceded.",
    ifIncreased: "Rotation or injuries in defence change the prediction more.",
    ifDecreased: "Defensive expectation stays closer to the team baseline.",
  },
  wcLowEventRhoBoost: {
    label: "Low-event draw boost (ρ)",
    whatItIs:
      "Extra draw probability in games expected to be low-chance (tight, defensive profiles).",
    ifIncreased: "0-0 and 1-1 draws get more weight in cautious matchups.",
    ifDecreased: "Draw probability stays closer to the pure Poisson/Dixon-Coles baseline.",
  },
};

export interface ParamChange {
  key: string;
  before: number;
  after: number;
  deltaPct: number;
}

const SCALAR_KEYS = [
  "muXg",
  "strengthExponent",
  "momentumGamma",
  "wcAttackFormWeight",
  "wcDefenseFormWeight",
  "wcFinishingRegressionWeight",
  "wcLineupAttackBlend",
  "wcLineupDefenseBlend",
  "wcLowEventRhoBoost",
] as const;

const DELTA_WEIGHT_KEYS = [
  "xgElo",
  "talent",
  "tournament",
  "recentXgForm",
  "fifa",
  "momentum",
] as const;

export function diffCalibrationConstants(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  minRelativeChange = 0.002
): ParamChange[] {
  const changes: ParamChange[] = [];

  for (const key of SCALAR_KEYS) {
    const b = Number(before[key]);
    const a = Number(after[key]);
    if (!Number.isFinite(b) || !Number.isFinite(a)) continue;
    const deltaPct = b !== 0 ? (a - b) / Math.abs(b) : a !== 0 ? 1 : 0;
    if (Math.abs(deltaPct) < minRelativeChange) continue;
    changes.push({ key, before: b, after: a, deltaPct });
  }

  const beforeWeights = (before.deltaWeights as Record<string, number> | undefined) ?? {};
  const afterWeights = (after.deltaWeights as Record<string, number> | undefined) ?? {};
  for (const wKey of DELTA_WEIGHT_KEYS) {
    const b = Number(beforeWeights[wKey]);
    const a = Number(afterWeights[wKey]);
    if (!Number.isFinite(b) || !Number.isFinite(a)) continue;
    const deltaPct = b !== 0 ? (a - b) / Math.abs(b) : a !== 0 ? 1 : 0;
    if (Math.abs(deltaPct) < minRelativeChange) continue;
    changes.push({
      key: `deltaWeights.${wKey}`,
      before: b,
      after: a,
      deltaPct,
    });
  }

  return changes.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct));
}

export function explainParamChange(change: ParamChange): string {
  const info = PARAM_EXPLANATIONS[change.key];
  if (!info) {
    return `${change.key} moved from ${change.before.toFixed(4)} to ${change.after.toFixed(4)}.`;
  }
  const direction = change.after > change.before ? info.ifIncreased : info.ifDecreased;
  const pct = (change.deltaPct * 100).toFixed(1);
  const sign = change.deltaPct >= 0 ? "+" : "";
  return `**${info.label}** (${sign}${pct}%): ${info.whatItIs} ${direction}`;
}

export function buildImplicationsParagraph(changes: ParamChange[]): string {
  if (!changes.length) {
    return "No model constants changed this run. Upcoming predictions still refresh with new match data (xG-Elo, player form, lineups) but use the same calibrated weights.";
  }

  const bullets = changes.slice(0, 6).map((c) => {
    const info = PARAM_EXPLANATIONS[c.key];
    const direction = c.after > c.before ? info?.ifIncreased : info?.ifDecreased;
    return direction ?? `${c.key} adjusted.`;
  });

  const headline =
    changes.length === 1
      ? "One calibration knob moved after backtesting finished matches."
      : `${changes.length} calibration knobs moved after backtesting finished matches.`;

  return `${headline} Together this means:\n${bullets.map((b) => `- ${b}`).join("\n")}\n\nPre-kickoff predictions on the hub were re-synced with these settings, so any change above is already reflected in upcoming fixture cards.`;
}
