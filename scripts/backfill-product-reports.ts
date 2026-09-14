/**
 * Backfill existing data/reports/glpm-league-run-*.{md,pdf} into Storage + product_reports.
 *
 * Usage: npx tsx scripts/backfill-product-reports.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  createReportsServiceClientFromEnv,
  uploadProductReportFiles,
} from "../src/lib/product-reports";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "data", "reports");

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

async function main() {
  loadEnvLocal();
  const client = createReportsServiceClientFromEnv();
  if (!client) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!fs.existsSync(REPORT_DIR)) {
    console.log("No data/reports directory");
    return;
  }

  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((f) => /^glpm-league-run-\d+-.*\.md$/i.test(f))
    .sort();

  let ok = 0;
  let failed = 0;
  for (const mdName of files) {
    const m = mdName.match(/^glpm-league-run-(\d+)-(.+)\.md$/i);
    if (!m) continue;
    const seasonId = Number(m[1]);
    const stamp = m[2];
    const mdPath = path.join(REPORT_DIR, mdName);
    const pdfPath = path.join(REPORT_DIR, mdName.replace(/\.md$/i, ".pdf"));
    const mdBody = fs.readFileSync(mdPath);
    const pdfBody = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;
    const result = await uploadProductReportFiles(client, {
      kind: "glpm-league-run",
      title: `GLPM league run · season ${seasonId}`,
      seasonId,
      summary: `Backfill ${stamp}`,
      storagePathMd: `glpm/${seasonId}/${stamp}.md`,
      storagePathPdf: pdfBody ? `glpm/${seasonId}/${stamp}.pdf` : null,
      mdBody,
      pdfBody,
    });
    if (result.error) {
      failed += 1;
      console.warn(`fail ${mdName}: ${result.error}`);
    } else {
      ok += 1;
      console.log(`ok ${mdName}`);
    }
  }
  console.log(`Done. uploaded=${ok} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
