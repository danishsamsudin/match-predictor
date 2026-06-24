import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { WcModelXiResolution } from "@/lib/world-cup/resolve-wc-model-starting-xi";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import type { PredictionResult } from "@/lib/types/prediction";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveWcModelSquadPrediction(input: {
  supabase: SupabaseClient;
  matchId: string;
  homeTeamApiId: number;
  awayTeamApiId: number;
  hubRow: HubPredictionRow;
  result: PredictionResult;
  playerProps: PlayerPropsPayload | null;
  homeXi?: WcModelXiResolution;
  awayXi?: WcModelXiResolution;
}): Promise<void> {
  const wcClient = input.supabase as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const teamPrediction = {
    homeWinPct: input.result.homeWinPct,
    drawPct: input.result.drawPct,
    awayWinPct: input.result.awayWinPct,
    expectedGoals: input.result.expectedGoals,
    estimated: input.result.estimated,
    predictedScore: {
      home: input.hubRow.predicted_score_home,
      away: input.hubRow.predicted_score_away,
    },
    under25Pct: input.hubRow.under_2_5_pct,
    over25Pct: input.hubRow.over_2_5_pct,
  };

  const modelXiMeta = {
    home: input.homeXi
      ? {
          source: input.homeXi.source,
          coverage: input.homeXi.coverage,
          warnings: input.homeXi.warnings,
          playerNames: input.homeXi.playerNames,
        }
      : null,
    away: input.awayXi
      ? {
          source: input.awayXi.source,
          coverage: input.awayXi.coverage,
          warnings: input.awayXi.warnings,
          playerNames: input.awayXi.playerNames,
        }
      : null,
  };

  const { error } = await wcClient.from("world_cup_model_squad_predictions").upsert({
    match_id: input.matchId,
    home_team_api_id: input.homeTeamApiId,
    away_team_api_id: input.awayTeamApiId,
    lineup_source: "model_xi",
    model_version: input.hubRow.model_version,
    computed_at: new Date().toISOString(),
    team_prediction: teamPrediction,
    player_props: input.playerProps,
    snapshot: input.hubRow.snapshot,
    model_xi_meta: modelXiMeta,
  });

  if (error) throw new Error(error.message);
}
