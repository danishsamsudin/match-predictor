#!/usr/bin/env node
/**
 * Export docs/GLPM_COFOUNDER_GUIDE.md to A4 PDF via Chrome headless.
 * No pandoc required — uses marked + puppeteer-core (same pattern as WC export).
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MD_PATH = path.join(ROOT, "docs", "GLPM_COFOUNDER_GUIDE.md");
const HTML_PATH = path.join(ROOT, "export", "glpm-cofounder-guide.html");
const OUTPUT_PATH = path.join(ROOT, "docs", "GLPM_COFOUNDER_GUIDE.pdf");

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

function loadPackage(name, installSpec) {
  const require = createRequire(import.meta.url);
  try {
    return require(name);
  } catch {
    execSync(`npm install --no-save ${installSpec}`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    return require(name);
  }
}

function preprocessMermaid(markdown) {
  return markdown.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_, body) =>
      `<div class="diagram-note"><p><strong>Architecture diagram</strong> (see markdown source for interactive version):</p><pre>${body.trim().replace(/</g, "&lt;")}</pre></div>`
  );
}

function buildHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 22mm 20mm 24mm 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1a1a1a;
      max-width: 100%;
      margin: 0;
      padding: 0;
    }
    h1 { font-size: 22pt; margin: 0 0 0.4em; page-break-after: avoid; }
    h2 {
      font-size: 14pt;
      margin: 1.6em 0 0.5em;
      padding-top: 0.3em;
      border-top: 1px solid #ddd;
      page-break-after: avoid;
    }
    h3 { font-size: 11.5pt; margin: 1.2em 0 0.4em; page-break-after: avoid; }
    h4 { font-size: 10.5pt; margin: 1em 0 0.3em; page-break-after: avoid; }
    p, li { orphans: 3; widows: 3; }
    ul, ol { padding-left: 1.4em; }
    li { margin: 0.2em 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin: 0.8em 0 1.2em;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f4f4f4; font-weight: 600; }
    code {
      font-family: "SF Mono", Menlo, Consolas, monospace;
      font-size: 9pt;
      background: #f5f5f5;
      padding: 0.1em 0.35em;
      border-radius: 3px;
    }
    pre {
      background: #f7f7f7;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.45;
      page-break-inside: avoid;
    }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
    blockquote {
      margin: 0.8em 0;
      padding: 0.4em 1em;
      border-left: 3px solid #ccc;
      color: #444;
    }
    .diagram-note {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 10px 12px;
      margin: 1em 0;
      page-break-inside: avoid;
    }
    .diagram-note pre {
      background: none;
      border: none;
      padding: 0;
      margin: 0.4em 0 0;
      font-size: 8pt;
    }
    a { color: #1a5276; text-decoration: none; }
    em { color: #555; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error(`Missing source: ${MD_PATH}`);
    process.exit(1);
  }

  const chromePath = resolveChrome();
  if (!chromePath) {
    console.error(
      "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH."
    );
    process.exit(1);
  }

  const { marked } = loadPackage("marked", "marked@15");
  const puppeteer = loadPackage("puppeteer-core", "puppeteer-core@23");

  const markdown = fs.readFileSync(MD_PATH, "utf8");
  const processed = preprocessMermaid(markdown);
  const bodyHtml = marked.parse(processed, { gfm: true, breaks: false });
  const html = buildHtml(bodyHtml, "GLPM Co-founder Guide");

  fs.mkdirSync(path.dirname(HTML_PATH), { recursive: true });
  fs.writeFileSync(HTML_PATH, html, "utf8");

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${HTML_PATH}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await new Promise((r) => setTimeout(r, 300));

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    await page.pdf({
      path: OUTPUT_PATH,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "22mm", right: "20mm", bottom: "24mm", left: "20mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:8pt;color:#666;font-family:Helvetica,Arial,sans-serif;
          padding:0 20mm;display:flex;justify-content:space-between;">
          <span>GLPM Co-founder Guide</span>
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
