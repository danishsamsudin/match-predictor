import { ALL_MARKET_MODEL_IDS, type MarketModelId } from "@/lib/world-cup/market-models/types";

export const MARKET_MODEL_LABELS: Record<MarketModelId, string> = {
  win_probability: "Win probability (1X2)",
  team_comparison: "Team comparison",
  player_props_anytime: "Player props — anytime scorer",
  player_props_goal_assist: "Player props — goal or assist",
  player_props_sot: "Player props — shots on target",
  correct_score: "Correct score",
  winning_margin: "Winning margin",
  asian_handicap: "Asian handicap",
  goals_over_under: "Goals over/under",
  btts: "Both teams to score",
  expected_goals: "Expected goals",
  form_momentum: "Form & momentum",
  event_stats: "Estimated match stats",
};

export { ALL_MARKET_MODEL_IDS };
