/**
 * Calibrate player goal-prop ML coefficients from Opta evaluation rows.
 *
 * Usage: npx tsx scripts/wc-calibrate-player-props.ts
 */
import { mergePlayerPropMlCoeffs, trainPlayerPropMlCoeffs } from "../src/lib/prediction/player-props-ml";
import {
  clearWcCalibrationCache,
  getDefaultWcCalibrationConstants,
  loadWcCalibrationConfig,
} from "../src/lib/world-cup/wc-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadWcCalibrationConfig();
  const defaults = getDefaultWcCalibrationConstants();

  const { data: evalRows, error } = await supabase
    .from("world_cup_player_prop_evaluations")
    .select("*")
    .eq("market", "anytime_scorer");

  if (error) throw new Error(error.message);
  const scorerRows = (evalRows ?? []).filter(
    (r) => r.predicted_prob != null && r.predicted_lambda != null
  );

  if (scorerRows.length < 8) {
    console.log(
      `Only ${scorerRows.length} anytime-scorer evaluations — keeping deployed player-prop coeffs.`
    );
    return;
  }

  const matchIds = [...new Set(scorerRows.map((r) => String(r.match_id)))];
  const { data: preds } = await supabase
    .from("world_cup_model_squad_predictions")
    .select("match_id, player_props, home_team_api_id, away_team_api_id")
    .in("match_id", matchIds);

  const teamXgByMatchPlayer = new Map<string, number>();
  for (const pred of preds ?? []) {
    const props = pred.player_props as {
      home?: { teamExpectedGoals?: number; anytimeScorer?: Array<{ playerName: string }> };
      away?: { teamExpectedGoals?: number; anytimeScorer?: Array<{ playerName: string }> };
    } | null;
    if (!props) continue;
    for (const side of [
      { side: props.home, teamApiId: Number(pred.home_team_api_id) },
      { side: props.away, teamApiId: Number(pred.away_team_api_id) },
    ]) {
      if (!side.side) continue;
      const teamXg = Number(side.side.teamExpectedGoals ?? 1.25);
      for (const line of side.side.anytimeScorer ?? []) {
        teamXgByMatchPlayer.set(
          `${pred.match_id}|${side.teamApiId}|${normalizeName(line.playerName)}`,
          teamXg
        );
      }
    }
  }

  const { data: formRows } = await supabase
    .from("world_cup_player_tournament_form")
    .select("team_api_id, player_name, chance_index_per90");

  const chanceByTeamPlayer = new Map<string, number>();
  for (const row of formRows ?? []) {
    chanceByTeamPlayer.set(
      `${row.team_api_id}|${normalizeName(String(row.player_name))}`,
      Number(row.chance_index_per90 ?? 0)
    );
  }

  const trainingRows = scorerRows.map((row) => {
    const teamApiId = Number(row.team_api_id);
    const norm = normalizeName(String(row.player_name));
    const chance =
      chanceByTeamPlayer.get(`${teamApiId}|${norm}`) ?? 0;
    const teamXg =
      teamXgByMatchPlayer.get(`${row.match_id}|${teamApiId}|${norm}`) ?? 1.25;

    return {
      hit: Boolean(row.hit),
      predictedProb: Number(row.predicted_prob),
      predictedLambda: Number(row.predicted_lambda),
      chanceIndexPer90: chance,
      isPenaltyTaker: false,
      isStarter: true,
      roleForward: false,
      roleMid: true,
      teamExpectedGoals: teamXg,
    };
  });

  const trained = trainPlayerPropMlCoeffs(
    trainingRows,
    mergePlayerPropMlCoeffs(current.playerPropModelCoeffs)
  );

  const blendStep = 0.12;
  const deployed = mergePlayerPropMlCoeffs(current.playerPropModelCoeffs);
  const candidate = mergePlayerPropMlCoeffs({
    intercept:
      deployed.intercept * (1 - blendStep) + trained.coeffs.intercept * blendStep,
    logLambdaSlope:
      deployed.logLambdaSlope * (1 - blendStep) +
      trained.coeffs.logLambdaSlope * blendStep,
    chanceIndexSlope:
      deployed.chanceIndexSlope * (1 - blendStep) +
      trained.coeffs.chanceIndexSlope * blendStep,
    penaltyTakerSlope:
      deployed.penaltyTakerSlope * (1 - blendStep) +
      trained.coeffs.penaltyTakerSlope * blendStep,
    starterSlope:
      deployed.starterSlope * (1 - blendStep) + trained.coeffs.starterSlope * blendStep,
    roleForwardSlope:
      deployed.roleForwardSlope * (1 - blendStep) +
      trained.coeffs.roleForwardSlope * blendStep,
    roleMidSlope:
      deployed.roleMidSlope * (1 - blendStep) + trained.coeffs.roleMidSlope * blendStep,
    teamXgSlope:
      deployed.teamXgSlope * (1 - blendStep) + trained.coeffs.teamXgSlope * blendStep,
    mlBlend: deployed.mlBlend,
    structuralZeroScale: deployed.structuralZeroScale,
    wcGoalShare: deployed.wcGoalShare,
  });

  const version = `${current.modelVersion}-props-${trained.sampleSize}`;
  const { data: existing } = await supabase
    .from("world_cup_calibration_config")
    .select("id")
    .eq("version", version)
    .maybeSingle();

  if (existing) {
    console.log(`Player prop calibration ${version} already saved — skipping.`);
    return;
  }

  const nextConstants = {
    ...current,
    playerPropModelCoeffs: candidate,
    modelVersion: version,
  };

  const calibrationNote = `Player prop ML calibration (${trained.sampleSize} anytime-scorer lines, Brier ${trained.brier.toFixed(4)})`;

  const { error: insertErr } = await supabase.from("world_cup_calibration_config").insert({
    version,
    constants: nextConstants,
    metrics: {
      player_prop_brier: trained.brier,
      player_prop_samples: trained.sampleSize,
      player_prop_calibrated_at: new Date().toISOString(),
      method: "player_prop_logistic_blend",
      note: calibrationNote,
    },
    effective_from: new Date().toISOString(),
  });

  if (insertErr) throw new Error(insertErr.message);
  clearWcCalibrationCache();

  console.log("Player prop calibration updated:");
  console.log(`  samples: ${trained.sampleSize}`);
  console.log(`  Brier:   ${trained.brier.toFixed(4)}`);
  console.log(`  intercept: ${candidate.intercept.toFixed(3)} (was ${deployed.intercept.toFixed(3)})`);
  console.log(
    `  logLambdaSlope: ${candidate.logLambdaSlope.toFixed(3)} (was ${deployed.logLambdaSlope.toFixed(3)})`
  );
  console.log(
    `  chanceIndexSlope: ${candidate.chanceIndexSlope.toFixed(3)} (was ${deployed.chanceIndexSlope.toFixed(3)})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
