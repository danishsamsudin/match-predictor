import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import type { GlpmValidationStatus } from "../types";
import {
  summarizeValidation,
  validateMatchBundle,
  type PlayerMinutesLike,
  type TeamStatsLike,
  type ValidationIssue,
} from "./rules";

type Client = SupabaseClient<Database>;

export async function writeValidationLogs(
  supabase: Client,
  issues: ValidationIssue[],
  layer: "L1" | "L2" = "L1"
): Promise<void> {
  if (!issues.length) return;
  const rows = issues.map((i) => ({
    layer,
    entity_type: i.entityType,
    entity_key: i.entityKey,
    rule_code: i.ruleCode,
    severity: i.severity,
    message: i.message,
    observed: i.observed ?? null,
  }));
  const { error } = await supabase.from("glpm_validation_logs").insert(rows);
  if (error) throw new Error(`writeValidationLogs failed: ${error.message}`);
}

export async function setMatchStatsValidationStatus(
  supabase: Client,
  matchSmId: number,
  status: GlpmValidationStatus
): Promise<void> {
  const { error } = await supabase
    .from("glpm_match_team_stats")
    .update({ validation_status: status })
    .eq("match_sm_id", matchSmId);
  if (error) throw new Error(`setMatchStatsValidationStatus failed: ${error.message}`);
}

export async function validateAndPersistMatchBundle(
  supabase: Client,
  args: {
    home: TeamStatsLike;
    away: TeamStatsLike;
    knownTeamIds?: Set<number>;
    knownPlayerIds?: Set<number>;
    playerMinutes?: PlayerMinutesLike[];
  }
): Promise<{ issues: ValidationIssue[]; status: GlpmValidationStatus }> {
  const issues = validateMatchBundle(args);
  await writeValidationLogs(supabase, issues, "L1");
  const summary = summarizeValidation(issues);
  await setMatchStatsValidationStatus(supabase, args.home.match_sm_id, summary.status);
  return { issues, status: summary.status };
}
