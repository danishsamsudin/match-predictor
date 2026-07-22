/**
 * One-shot GLPM league pipeline: SportMonks backfill → train 7 engines → vectors → report.
 *
 * Usage:
 *   npm run glpm:league-run -- --season-id 25583
 *   npm run glpm:league-run -- --season-id 28083 --include-scheduled
 *   npm run glpm:league-run -- --season-id 25583 --skip-backfill --skip-bayesian
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SM_SEASON_2025_26, SM_SEASON_2026_27 } from "../src/lib/sportmonks/constants";
import { tryCreateServiceClient } from "../src/lib/supabase";

const ROOT = process.cwd();

/** Default training season: 2025/26 PL until 2026/27 has finished matches. */
const DEFAULT_TRAIN_SEASON_ID = String(SM_SEASON_2025_26.PREMIER_LEAGUE);

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = sec - min * 60;
  return `${min}m ${rem.toFixed(0)}s`;
}

/** Run a subprocess, streaming stdout/stderr live. Optionally also capture for JSON parsing. */
function run(cmd: string, args: string[], capture = false): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stdout += text;
        process.stdout.write(text);
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stderr += text;
        process.stderr.write(text);
      });
    }

    child.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\nFailed to start ${cmd}: ${message}\n`);
      resolve({ status: 1, stdout, stderr: stderr || message });
    });

    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

type StepTracker = {
  current: number;
  total: number;
};

function beginStep(tracker: StepTracker, title: string, detail?: string): number {
  tracker.current += 1;
  const label = `[${tracker.current}/${tracker.total}]`;
  console.log(`\n${"─".repeat(64)}`);
  console.log(`${label} ${title}`);
  if (detail) console.log(`         ${detail}`);
  console.log(`${"─".repeat(64)}`);
  return Date.now();
}

function endStep(tracker: StepTracker, startedAt: number, note?: string) {
  const label = `[${tracker.current}/${tracker.total}]`;
  const elapsed = formatDuration(Date.now() - startedAt);
  console.log(`✓ ${label} finished in ${elapsed}${note ? ` — ${note}` : ""}`);
}

function skipStep(tracker: StepTracker, title: string, reason: string) {
  tracker.current += 1;
  const label = `[${tracker.current}/${tracker.total}]`;
  console.log(`\n○ ${label} ${title} — skipped (${reason})`);
}

/** Parse the last complete JSON object from captured npm/python stdout. */
function parseJsonTail(stdout: string): unknown {
  const trimmed = stdout.trim();
  let searchEnd = trimmed.length;
  while (searchEnd > 0) {
    const start = trimmed.lastIndexOf("{", searchEnd - 1);
    if (start < 0) break;
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {
      searchEnd = start;
    }
  }
  return { raw_tail: stdout.slice(-800) };
}

function summarizeTrainResult(script: string, summary: unknown): string {
  if (!summary || typeof summary !== "object") return "no summary";
  const s = summary as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof s.teams === "number") parts.push(`${s.teams} teams`);
  if (typeof s.keepers === "number") parts.push(`${s.keepers} keepers`);
  if (typeof s.match_rows === "number") parts.push(`${s.match_rows} match-rows`);
  if (typeof s.model_version === "string") parts.push(s.model_version);
  const top = Array.isArray(s.top) ? s.top : [];
  if (top.length > 0 && top[0] && typeof top[0] === "object") {
    const first = top[0] as Record<string, unknown>;
    const ratingKey = Object.keys(first).find((k) => k.startsWith("rating_"));
    if (ratingKey && typeof first[ratingKey] === "number") {
      const idKey = first.team_sm_id != null ? "team" : "player";
      const id = first.team_sm_id ?? first.player_sm_id;
      parts.push(`top ${idKey}=${id} @ ${Number(first[ratingKey]).toFixed(1)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : `${script} ok`;
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Snapshot on-disk ML artifacts before training overwrites them. */
function snapshotArtifactsBeforeTrain(seasonId: string): string | null {
  const engines = [
    "attack",
    "defence",
    "goalkeeper",
    "build_up",
    "possession",
    "pressing",
    "finishing",
  ] as const;
  const snapshotDir = path.join(
    ROOT,
    "data/reports/.glpm-artifact-snapshots",
    seasonId,
    "before"
  );
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  let copied = false;
  let fileCount = 0;
  for (const engine of engines) {
    const src = path.join(ROOT, "models/ratings", engine, "artifacts");
    if (!fs.existsSync(src)) continue;
    const files = fs.readdirSync(src).filter((f) => f !== ".gitkeep");
    if (files.length === 0) continue;
    console.log(`  · snapshotting ${engine} (${files.length} file(s))`);
    copyDirRecursive(src, path.join(snapshotDir, engine));
    copied = true;
    fileCount += files.length;
  }
  if (copied) {
    console.log(`  · wrote ${fileCount} artifact file(s) → ${snapshotDir}`);
  }
  return copied ? snapshotDir : null;
}

function pickSampleTeams(trainSummaries: Record<string, unknown>): {
  homeTeamId?: number;
  awayTeamId?: number;
} {
  const attack = trainSummaries["glpm:attack-train"] as
    | { top?: Array<{ team_sm_id: number }> }
    | undefined;
  const top = attack?.top ?? [];
  if (top.length >= 2) {
    return { homeTeamId: top[0]!.team_sm_id, awayTeamId: top[1]!.team_sm_id };
  }
  return {};
}

async function assertSeasonTrainable(seasonId: string): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  console.log("  · querying glpm_matches for completed fixtures...");
  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id, status")
    .eq("season_id", Number(seasonId));
  if (matchErr) throw new Error(`Preflight match query failed: ${matchErr.message}`);

  const rows = matches ?? [];
  const completed = rows.filter(
    (m) => m.status && !/^not started$/i.test(String(m.status).trim())
  );
  const matchIds = completed.map((m) => m.sm_id);
  console.log(
    `  · found ${rows.length} match row(s), ${completed.length} completed, ${
      rows.length - completed.length
    } scheduled/other`
  );

  if (matchIds.length === 0) {
    const isFuturePl =
      Number(seasonId) === SM_SEASON_2026_27.PREMIER_LEAGUE && rows.length > 0;
    const hint = isFuturePl
      ? `\nPremier League 2026/27 has not started yet (all ${rows.length} fixtures are scheduled).\n` +
        `Train on the current season instead:\n` +
        `  npm run glpm:league-run -- --season-id ${SM_SEASON_2025_26.PREMIER_LEAGUE}\n`
      : `\nUse a season with finished matches that have team statistics (xG, shots).\n`;
    throw new Error(
      `Season ${seasonId} has no completed matches in glpm_matches.${hint}`
    );
  }

  console.log("  · querying glpm_match_team_stats for xG/shots coverage...");
  const { data: stats, error: statsErr } = await supabase
    .from("glpm_match_team_stats")
    .select("xg, shots")
    .in("match_sm_id", matchIds);
  if (statsErr) throw new Error(`Preflight stats query failed: ${statsErr.message}`);

  const withTarget = (stats ?? []).filter((s) => s.xg != null || s.shots != null);
  const minSides = 40; // ~20 completed matches (home + away)
  console.log(
    `  · ${withTarget.length}/${stats?.length ?? 0} team-rows have xG or shots ` +
      `(need ≥ ${minSides})`
  );

  if (withTarget.length < minSides) {
    throw new Error(
      `Season ${seasonId} has only ${withTarget.length} team-match rows with xG or shots ` +
        `(need at least ${minSides} to train).\n` +
        `Completed matches: ${completed.length}. ` +
        `If you ingested a future schedule, re-run with completed fixtures only:\n` +
        `  npm run glpm:sm-backfill -- ${seasonId} --completed-only\n` +
        `Or pick a season with played matches, e.g. PL 2025/26:\n` +
        `  npm run glpm:league-run -- --season-id ${SM_SEASON_2025_26.PREMIER_LEAGUE}`
    );
  }

  console.log(
    `  · Preflight OK: ${completed.length} completed matches, ${withTarget.length} team-rows with xG/shots`
  );
}

async function main() {
  loadEnvLocal();

  const argv = process.argv.slice(2);
  const seasonIdx = argv.indexOf("--season-id");
  const seasonId = seasonIdx >= 0 ? argv[seasonIdx + 1]! : DEFAULT_TRAIN_SEASON_ID;
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const skipBackfill = argv.includes("--skip-backfill");
  const skipBayesian = argv.includes("--skip-bayesian");
  const includeScheduled = argv.includes("--include-scheduled");

  if (!seasonId || !/^\d+$/.test(seasonId)) {
    console.error(
      "Usage: npm run glpm:league-run -- --season-id <ID> [--limit N] [--skip-backfill] [--skip-bayesian] [--include-scheduled]"
    );
    process.exit(1);
  }

  const trainScripts = [
    "glpm:attack-train",
    "glpm:defence-train",
    "glpm:goalkeeper-train",
    "glpm:build-up-train",
    "glpm:possession-train",
    "glpm:pressing-train",
    "glpm:finishing-train",
  ] as const;

  // Fixed roadmap so step numbers stay stable even when flags skip work.
  const plan = [
    {
      id: "backfill",
      title: "SportMonks season backfill",
      detail: includeScheduled
        ? "ingest schedule + completed fixtures"
        : "ingest completed fixtures only",
    },
    {
      id: "preflight",
      title: "Preflight data check",
      detail: "verify completed matches and xG/shots coverage",
    },
    {
      id: "team-stats",
      title: "Re-map team stats from stored payloads",
      detail: "PPDA, build-up proxies, pressing fields (no API calls)",
    },
    {
      id: "gk-stats",
      title: "Backfill GK player stats",
      detail: "lineups + team psxg/saves → glpm_match_player_stats",
    },
    {
      id: "snapshot",
      title: "Snapshot existing ML artifacts",
      detail: "copy pre-train models for later weight diffs",
    },
    ...trainScripts.map((script) => ({
      id: script,
      title: `Train ${script.replace("glpm:", "").replace("-train", "")} engine`,
      detail: `npm run ${script}`,
    })),
    {
      id: "assemble",
      title: "Assemble rating vectors",
      detail: "combine engine ratings into team/player vectors",
    },
    {
      id: "bayesian",
      title: "Bayesian temporal smoothing",
      detail: "half-life 90 days",
    },
    {
      id: "predict",
      title: "Sample matchup prediction",
      detail: "top-2 attack teams from this training run",
    },
    {
      id: "introspect",
      title: "Model introspection",
      detail: "weights + before/after diffs",
    },
    {
      id: "report",
      title: "Write plain-English report",
      detail: "markdown summary under data/reports/",
    },
    {
      id: "report-pdf",
      title: "Export report PDF",
      detail: "compact A4 insight layout from the markdown report",
    },
  ] as const;

  const tracker: StepTracker = { current: 0, total: plan.length };
  const pipelineStartedAt = Date.now();

  console.log(`\n${"═".repeat(64)}`);
  console.log(` GLPM league run — season ${seasonId}`);
  console.log(`${"═".repeat(64)}`);
  console.log(
    ` Flags: backfill=${skipBackfill ? "skip" : "on"}` +
      `, bayesian=${skipBayesian ? "skip" : "on"}` +
      `, scheduled=${includeScheduled ? "include" : "completed-only"}` +
      (limit ? `, limit=${limit}` : "")
  );
  console.log(`\nPipeline plan (${plan.length} steps):\n`);
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]!;
    let marker = " ";
    if (step.id === "backfill" && skipBackfill) marker = "○";
    if (step.id === "bayesian" && skipBayesian) marker = "○";
    console.log(`  ${marker} ${String(i + 1).padStart(2)}. ${step.title}`);
    console.log(`       ${step.detail}`);
  }
  console.log("");

  // ── 1. Season backfill ──────────────────────────────────────────────
  if (!skipBackfill) {
    const t0 = beginStep(
      tracker,
      "SportMonks season backfill",
      includeScheduled
        ? "Fetching schedule and ingesting fixtures (including scheduled)"
        : "Fetching schedule and ingesting completed fixtures only"
    );
    const backfillArgs = ["run", "glpm:sm-backfill", "--", seasonId];
    if (limit) backfillArgs.push("--limit", limit);
    if (!includeScheduled) backfillArgs.push("--completed-only");
    const backfill = await run("npm", backfillArgs);
    if (backfill.status !== 0) process.exit(backfill.status ?? 1);
    endStep(tracker, t0);
  } else {
    skipStep(tracker, "SportMonks season backfill", "--skip-backfill");
  }

  // ── 2. Preflight ────────────────────────────────────────────────────
  {
    const t0 = beginStep(
      tracker,
      "Preflight data check",
      "Confirm season has enough completed matches with xG/shots to train"
    );
    try {
      await assertSeasonTrainable(seasonId);
    } catch (err) {
      console.error("\nCannot train — insufficient match data:\n");
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    endStep(tracker, t0, "season is trainable");
  }

  // ── 3. Team stats remap ─────────────────────────────────────────────
  {
    const t0 = beginStep(
      tracker,
      "Re-map team stats from stored payloads",
      "Rewrites PPDA / build-up / pressing proxies from cached SportMonks payloads"
    );
    const teamStatsBackfill = await run(
      "npm",
      ["run", "glpm:sm-backfill-team-stats", "--", seasonId],
      true
    );
    if (teamStatsBackfill.status !== 0) {
      console.error(teamStatsBackfill.stderr || teamStatsBackfill.stdout);
      process.exit(teamStatsBackfill.status ?? 1);
    }
    endStep(tracker, t0);
  }

  // ── 4. GK stats backfill ────────────────────────────────────────────
  {
    const t0 = beginStep(
      tracker,
      "Backfill GK player stats",
      "Maps lineup keepers + team psxg/saves into glpm_match_player_stats"
    );
    const gkBackfill = await run(
      "npm",
      ["run", "glpm:sm-backfill-gk", "--", seasonId],
      true
    );
    if (gkBackfill.status !== 0) {
      console.error(gkBackfill.stderr || gkBackfill.stdout);
      process.exit(gkBackfill.status ?? 1);
    }
    endStep(tracker, t0);
  }

  // ── 5. Artifact snapshot ────────────────────────────────────────────
  let artifactSnapshotDir: string | null = null;
  {
    const t0 = beginStep(
      tracker,
      "Snapshot existing ML artifacts",
      "Preserve on-disk models before training overwrites them"
    );
    artifactSnapshotDir = snapshotArtifactsBeforeTrain(seasonId);
    if (artifactSnapshotDir) {
      endStep(tracker, t0, `saved under ${artifactSnapshotDir}`);
    } else {
      endStep(tracker, t0, "no prior artifacts (first baseline run)");
    }
  }

  // ── 6–12. Train seven engines ───────────────────────────────────────
  const trainSummaries: Record<string, unknown> = {};
  for (let i = 0; i < trainScripts.length; i++) {
    const script = trainScripts[i]!;
    const engine = script.replace("glpm:", "").replace("-train", "");
    const t0 = beginStep(
      tracker,
      `Train ${engine} engine (${i + 1}/${trainScripts.length})`,
      `npm run ${script} -- --season-id ${seasonId}`
    );
    const out = await run("npm", ["run", script, "--", "--season-id", seasonId], true);
    if (out.status !== 0) {
      console.error(out.stderr || out.stdout);
      process.exit(out.status ?? 1);
    }
    const summary = parseJsonTail(out.stdout);
    trainSummaries[script] = summary;
    endStep(tracker, t0, summarizeTrainResult(script, summary));
  }

  // ── Assemble vectors ────────────────────────────────────────────────
  {
    const t0 = beginStep(
      tracker,
      "Assemble rating vectors",
      "Merge the seven engine outputs into stored rating vectors"
    );
    const assemble = await run("npm", [
      "run",
      "glpm:assemble-vectors",
      "--",
      "--season-id",
      seasonId,
    ]);
    if (assemble.status !== 0) process.exit(assemble.status ?? 1);
    endStep(tracker, t0);
  }

  // ── Bayesian ────────────────────────────────────────────────────────
  if (!skipBayesian) {
    const t0 = beginStep(
      tracker,
      "Bayesian temporal smoothing",
      "Apply half-life=90 day decay across match history"
    );
    const bayes = await run(
      "npm",
      ["run", "glpm:bayesian-update", "--", "--season-id", seasonId, "--half-life", "90"],
      true
    );
    if (bayes.status !== 0) {
      console.warn("  · Bayesian update failed or skipped (too few matches?) — continuing.");
      trainSummaries["glpm:bayesian-update"] = {
        skipped: true,
        stderr: bayes.stderr.slice(-400),
      };
      endStep(tracker, t0, "continued after warning");
    } else {
      trainSummaries["glpm:bayesian-update"] = parseJsonTail(bayes.stdout);
      endStep(tracker, t0);
    }
  } else {
    skipStep(tracker, "Bayesian temporal smoothing", "--skip-bayesian");
  }

  // ── Sample prediction ───────────────────────────────────────────────
  const { homeTeamId, awayTeamId } = pickSampleTeams(trainSummaries);
  let samplePrediction: unknown = null;
  {
    const t0 = beginStep(
      tracker,
      "Sample matchup prediction",
      homeTeamId != null && awayTeamId != null
        ? `Predict home=${homeTeamId} vs away=${awayTeamId} (top attack teams)`
        : "No sample teams available from attack training summary"
    );
    if (homeTeamId != null && awayTeamId != null) {
      const pred = await run(
        "npm",
        [
          "run",
          "glpm:predict-matchup",
          "--",
          "--home-team-id",
          String(homeTeamId),
          "--away-team-id",
          String(awayTeamId),
          "--season-id",
          seasonId,
        ],
        true
      );
      if (pred.status === 0) {
        samplePrediction = parseJsonTail(pred.stdout);
        endStep(tracker, t0, `home ${homeTeamId} vs away ${awayTeamId}`);
      } else {
        samplePrediction = { error: pred.stderr.slice(-400) || "prediction failed" };
        endStep(tracker, t0, "prediction failed (continuing to report)");
      }
    } else {
      endStep(tracker, t0, "skipped — could not pick sample teams");
    }
  }

  const reportDir = path.join(ROOT, "data", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `glpm-league-run-${seasonId}-${timestamp}.md`);
  const summaryPath = path.join(reportDir, `.glpm-league-run-${seasonId}-summaries.json`);
  const introspectionPath = path.join(reportDir, `.glpm-introspection-${seasonId}.json`);

  // ── Introspection ───────────────────────────────────────────────────
  let introStatus: number | null = 1;
  {
    const t0 = beginStep(
      tracker,
      "Model introspection",
      artifactSnapshotDir
        ? "Compare current weights against pre-train snapshot"
        : "Inspect current weights (no before-snapshot available)"
    );
    const introArgs = [
      path.join(ROOT, "scripts/ml/run-introspect.sh"),
      "--season-id",
      seasonId,
      "--output",
      introspectionPath,
    ];
    if (artifactSnapshotDir) {
      introArgs.push("--before", artifactSnapshotDir);
    }
    const intro = await run("bash", introArgs, true);
    introStatus = intro.status;
    if (intro.status !== 0) {
      console.warn("  · Model introspection failed — report will omit weight diffs.");
      endStep(tracker, t0, "failed (non-fatal)");
    } else {
      endStep(tracker, t0, `wrote ${introspectionPath}`);
    }
  }

  // ── Report ──────────────────────────────────────────────────────────
  {
    const t0 = beginStep(
      tracker,
      "Write plain-English report",
      `Bundling summaries → ${reportPath}`
    );
    const bundle = {
      seasonId: Number(seasonId),
      timestamp: new Date().toISOString(),
      trainSummaries,
      samplePrediction,
      sampleMatchup: homeTeamId && awayTeamId ? { homeTeamId, awayTeamId } : null,
      introspectionPath: introStatus === 0 ? introspectionPath : null,
      artifactSnapshotDir,
    };
    console.log(`  · writing summary bundle → ${summaryPath}`);
    fs.writeFileSync(summaryPath, JSON.stringify(bundle, null, 2));

    console.log("  · running report writer...");
    const py = await run(
      "python3",
      [
        path.join(ROOT, "scripts/glpm_write_league_run_report.py"),
        "--season-id",
        seasonId,
        "--summaries",
        summaryPath,
        "--output",
        reportPath,
        ...(introStatus === 0 ? ["--introspection", introspectionPath] : []),
      ],
      true
    );
    if (py.status !== 0) {
      console.error(py.stderr || py.stdout);
      process.exit(py.status ?? 1);
    }
    endStep(tracker, t0, reportPath);
  }

  // ── PDF export ──────────────────────────────────────────────────────
  const pdfPath = reportPath.replace(/\.md$/i, ".pdf");
  {
    const t0 = beginStep(
      tracker,
      "Export report PDF",
      `Chrome headless → ${pdfPath}`
    );
    const pdf = await run(
      "node",
      [path.join(ROOT, "scripts/export-glpm-league-run-pdf.mjs"), reportPath, "--output", pdfPath],
      true
    );
    if (pdf.status !== 0) {
      console.warn(pdf.stderr || pdf.stdout);
      endStep(tracker, t0, "failed (non-fatal)");
    } else {
      endStep(tracker, t0, pdfPath);
    }
  }

  console.log(`\n${"═".repeat(64)}`);
  console.log(
    ` Done. ${tracker.current}/${tracker.total} steps in ${formatDuration(
      Date.now() - pipelineStartedAt
    )}`
  );
  console.log(` Report: ${reportPath}`);
  console.log(` PDF:    ${pdfPath}`);
  console.log(`${"═".repeat(64)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
