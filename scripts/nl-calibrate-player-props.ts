/**
 * Calibrate Nations League player markets from evaluation rows.
 *
 * Usage: npx tsx scripts/nl-calibrate-player-props.ts
 */
import {
  mergePlayerPropMlCoeffs,
  mergePlayerPropSotCoeffs,
  trainPlayerPropMlCoeffs,
  trainPlayerPropSotCoeffs,
  type PlayerPropMlCoeffs,
  type PlayerPropTrainingRow,
} from "../src/lib/prediction/player-props-ml";
import {
  loadNlCalibrationConfig,
  NL_CALIBRATION_DEFAULTS,
} from "../src/lib/nations-league/nl-calibration-config";
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

function asTrainingRow(row: Record<string, unknown>): PlayerPropTrainingRow {
  return {
    hit: Boolean(row.hit),
    predictedProb: Number(row.predicted_prob),
    predictedLambda: Number(row.predicted_lambda),
    chanceIndexPer90: Number(row.chance_index_per90 ?? 0),
    isPenaltyTaker: Boolean(row.is_penalty_taker),
    isStarter: row.is_starter == null ? true : Boolean(row.is_starter),
    roleForward: String(row.role ?? "") === "F",
    roleMid: String(row.role ?? "") === "M",
    teamExpectedGoals: Number(row.team_expected_goals ?? 1.25),
  };
}

function blendMl(deployed: PlayerPropMlCoeffs, trained: PlayerPropMlCoeffs, step = 0.12) {
  return mergePlayerPropMlCoeffs({
    intercept: deployed.intercept * (1 - step) + trained.intercept * step,
    logLambdaSlope: deployed.logLambdaSlope * (1 - step) + trained.logLambdaSlope * step,
    chanceIndexSlope: deployed.chanceIndexSlope * (1 - step) + trained.chanceIndexSlope * step,
    penaltyTakerSlope: deployed.penaltyTakerSlope * (1 - step) + trained.penaltyTakerSlope * step,
    starterSlope: deployed.starterSlope * (1 - step) + trained.starterSlope * step,
    roleForwardSlope: deployed.roleForwardSlope * (1 - step) + trained.roleForwardSlope * step,
    roleMidSlope: deployed.roleMidSlope * (1 - step) + trained.roleMidSlope * step,
    teamXgSlope: deployed.teamXgSlope * (1 - step) + trained.teamXgSlope * step,
    mlBlend: deployed.mlBlend,
    structuralZeroScale: deployed.structuralZeroScale,
    wcGoalShare: deployed.wcGoalShare,
  });
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadNlCalibrationConfig();
  const { data: evalRows, error } = await supabase
    .from("nations_league_player_prop_evaluations")
    .select("*");
  if (error) throw new Error(error.message);

  const byMarket = new Map<string, Record<string, unknown>[]>();
  for (const row of evalRows ?? []) {
    if (row.predicted_prob == null || row.predicted_lambda == null) continue;
    const market = String(row.market);
    const list = byMarket.get(market) ?? [];
    list.push(row as Record<string, unknown>);
    byMarket.set(market, list);
  }

  const notes: string[] = [];
  const nextMarket = {
    ...current.marketModels,
    playerProps: { ...current.marketModels.playerProps },
  };

  const marketLabels = {
    anytime_scorer: "Anytime goalscorer",
    anytime_assist: "Anytime assist",
    goal_or_assist: "Goal or assist",
  } as const;

  for (const market of ["anytime_scorer", "anytime_assist", "goal_or_assist"] as const) {
    const rows = byMarket.get(market) ?? [];
    const label = marketLabels[market];
    console.log(`${label}: ${rows.length} scored line(s) (need 8 to retune)`);
    if (rows.length < 8) {
      notes.push(`${label}: kept previous settings (${rows.length} scored lines).`);
      continue;
    }
    const deployed =
      market === "anytime_scorer"
        ? mergePlayerPropMlCoeffs(current.marketModels.playerProps.anytime)
        : market === "anytime_assist"
          ? mergePlayerPropMlCoeffs(current.marketModels.playerProps.assist)
          : mergePlayerPropMlCoeffs(current.marketModels.playerProps.goalAssist);
    const trained = trainPlayerPropMlCoeffs(rows.map(asTrainingRow), deployed);
    const candidate = blendMl(deployed, trained.coeffs);
    if (market === "anytime_scorer") nextMarket.playerProps.anytime = candidate;
    else if (market === "anytime_assist") nextMarket.playerProps.assist = candidate;
    else nextMarket.playerProps.goalAssist = candidate;
    notes.push(`${label}: retuned on ${trained.sampleSize} player lines.`);
  }

  const sotRows = [...(byMarket.get("sot_0.5") ?? [])];
  console.log(`Shots on target (at least one): ${sotRows.length} scored line(s)`);
  if (sotRows.length >= 8) {
    const deployed = mergePlayerPropSotCoeffs(current.marketModels.playerProps.sot);
    const trained = trainPlayerPropSotCoeffs(
      sotRows.map((row) => ({
        hit: Boolean(row.hit),
        predictedProb: Number(row.predicted_prob),
        predictedLambda: Number(row.predicted_lambda),
        sotRatePer90: Number(row.sot_rate_per90 ?? row.predicted_lambda ?? 0.2),
        isStarter: row.is_starter == null ? true : Boolean(row.is_starter),
        roleForward: String(row.role ?? "") === "F",
        teamExpectedSot: Number(row.team_expected_sot ?? 3.1),
      })),
      deployed
    );
    const step = 0.12;
    nextMarket.playerProps.sot = mergePlayerPropSotCoeffs({
      intercept: deployed.intercept * (1 - step) + trained.coeffs.intercept * step,
      logLambdaSlope: deployed.logLambdaSlope * (1 - step) + trained.coeffs.logLambdaSlope * step,
      sotRateSlope: deployed.sotRateSlope * (1 - step) + trained.coeffs.sotRateSlope * step,
      starterSlope: deployed.starterSlope * (1 - step) + trained.coeffs.starterSlope * step,
      roleForwardSlope:
        deployed.roleForwardSlope * (1 - step) + trained.coeffs.roleForwardSlope * step,
      teamSotSlope: deployed.teamSotSlope * (1 - step) + trained.coeffs.teamSotSlope * step,
      mlBlend: deployed.mlBlend,
      structuralZeroScale: deployed.structuralZeroScale,
    });
    notes.push(`Shots on target: retuned on ${trained.sampleSize} player lines.`);
  } else {
    notes.push(`Shots on target: kept previous settings (${sotRows.length} scored lines).`);
  }

  const anytimeN = (byMarket.get("anytime_scorer") ?? []).length;
  const version = `${current.modelVersion}-props-${anytimeN || evalRows?.length || 0}`;
  const { data: existing } = await supabase
    .from("nations_league_calibration_config")
    .select("id")
    .eq("version", version)
    .maybeSingle();
  if (existing) {
    console.log(`Player-market settings ${version} already saved - skipping.`);
    return;
  }

  const { error: insertErr } = await supabase.from("nations_league_calibration_config").insert({
    version,
    constants: {
      ...NL_CALIBRATION_DEFAULTS,
      ...current,
      playerPropModelCoeffs: nextMarket.playerProps.anytime,
      marketModels: nextMarket,
      modelVersion: version,
    },
    metrics: {
      player_prop_samples: anytimeN,
      player_prop_calibrated_at: new Date().toISOString(),
      method: "player_prop_logistic_blend_all_heads",
      note: notes.join(" "),
    },
    effective_from: new Date().toISOString(),
  });
  if (insertErr) throw new Error(insertErr.message);

  console.log("Player-market settings updated:");
  for (const note of notes) console.log(`  ${note}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
