#!/usr/bin/env node
/**
 * Export Graham WC hub model algorithm documentation to A4 PDF
 * (research-paper layout, KaTeX math with Greek symbols).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(ROOT, "export", "wc-graham-model-algorithm.html");
const OUTPUT_PATH = path.join(ROOT, "export", "wc-graham-model-algorithm.pdf");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function resolveChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    const { execSync } = await import("node:child_process");
    execSync("npm install --no-save puppeteer-core@23", {
      cwd: ROOT,
      stdio: "inherit",
    });
    return require("puppeteer-core");
  }
}

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`Missing HTML source: ${HTML_PATH}`);
    process.exit(1);
  }

  const chromePath = resolveChrome();
  if (!chromePath) {
    console.error(
      "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH."
    );
    process.exit(1);
  }

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const fileUrl = `file://${HTML_PATH}`;

    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.waitForFunction(
      () => document.body.dataset.mathRendered === "true",
      { timeout: 60_000 }
    );
    // Allow KaTeX layout to settle
    await new Promise((r) => setTimeout(r, 500));

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    await page.pdf({
      path: OUTPUT_PATH,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "22mm",
        right: "20mm",
        bottom: "24mm",
        left: "20mm",
      },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:8pt;color:#666;font-family:'Times New Roman',serif;
          padding:0 20mm;display:flex;justify-content:space-between;">
          <span>Graham WC Hub Model</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
    });

    const stat = fs.statSync(OUTPUT_PATH);
    console.log(`Wrote ${OUTPUT_PATH} (${Math.round(stat.size / 1024)} KB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
