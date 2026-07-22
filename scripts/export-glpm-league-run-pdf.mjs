#!/usr/bin/env node
/**
 * Export a GLPM league-run markdown report to a compact insight-style A4 PDF.
 *
 * Usage:
 *   node scripts/export-glpm-league-run-pdf.mjs data/reports/glpm-league-run-25597-....md
 *   node scripts/export-glpm-league-run-pdf.mjs --input <md> --output <pdf>
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadExportDeps() {
  const require = createRequire(import.meta.url);
  const tryLoad = () => {
    let markedMod = null;
    let puppeteerMod = null;
    try {
      markedMod = require("marked");
    } catch {
      /* missing */
    }
    try {
      puppeteerMod = require("puppeteer-core");
    } catch {
      /* missing */
    }
    return { markedMod, puppeteerMod };
  };

  let { markedMod, puppeteerMod } = tryLoad();
  if (!markedMod || !puppeteerMod) {
    execSync("npm install --no-save marked@15.0.12 puppeteer-core@23.11.1", {
      cwd: ROOT,
      stdio: "inherit",
    });
    // Fresh resolve after install (clear partial failed requires).
    const requireAgain = createRequire(import.meta.url);
    markedMod = requireAgain("marked");
    puppeteerMod = requireAgain("puppeteer-core");
  }
  return {
    marked: markedMod.marked || markedMod,
    puppeteer: puppeteerMod,
  };
}

function parseArgs(argv) {
  let input = null;
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      input = argv[++i];
    } else if (arg === "--output" || arg === "-o") {
      output = argv[++i];
    } else if (!arg.startsWith("-") && !input) {
      input = arg;
    }
  }
  if (!input) {
    console.error(
      "Usage: node scripts/export-glpm-league-run-pdf.mjs <report.md> [--output report.pdf]"
    );
    process.exit(1);
  }
  const mdPath = path.isAbsolute(input) ? input : path.join(ROOT, input);
  const pdfPath = output
    ? path.isAbsolute(output)
      ? output
      : path.join(ROOT, output)
    : mdPath.replace(/\.md$/i, ".pdf");
  return { mdPath, pdfPath };
}

function buildHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm 14mm 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      line-height: 1.35;
      color: #15202b;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 16pt;
      font-weight: 700;
      margin: 0 0 0.25em;
      letter-spacing: -0.02em;
      page-break-after: avoid;
    }
    h2 {
      font-size: 11pt;
      font-weight: 700;
      margin: 1.1em 0 0.35em;
      padding: 0.15em 0 0.2em;
      border-bottom: 1.5px solid #1f6feb;
      color: #0b1f33;
      page-break-after: avoid;
    }
    h3 {
      font-size: 9.5pt;
      font-weight: 650;
      margin: 0.85em 0 0.3em;
      color: #243447;
      page-break-after: avoid;
    }
    p { margin: 0.35em 0 0.55em; }
    ul, ol { margin: 0.3em 0 0.7em; padding-left: 1.2em; }
    li { margin: 0.12em 0; }
    em { color: #4a5568; }
    strong { font-weight: 650; }
    a { color: #1f6feb; text-decoration: none; }
    code {
      font-family: "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 7.5pt;
      background: #f2f5f8;
      padding: 0.05em 0.25em;
      border-radius: 2px;
      word-break: break-all;
    }
    pre {
      background: #f5f7fa;
      border: 1px solid #dbe2ea;
      border-radius: 3px;
      padding: 6px 8px;
      overflow-x: auto;
      font-size: 7pt;
      line-height: 1.35;
      page-break-inside: avoid;
    }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #d0d7de; margin: 0.9em 0; }
    blockquote {
      margin: 0.5em 0;
      padding: 0.25em 0.7em;
      border-left: 3px solid #9ec5fe;
      color: #3d4f63;
      background: #f7faff;
    }
    .table-wrap {
      width: 100%;
      overflow: visible;
      margin: 0.4em 0 0.9em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7pt;
      line-height: 1.25;
      margin: 0;
    }
    th, td {
      border: 1px solid #c9d4e0;
      padding: 3px 4px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
      hyphens: auto;
    }
    th {
      background: #e8eef6;
      font-weight: 650;
      color: #0b1f33;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    /* Large inventory tables may span pages */
    table.wide-ok { page-break-inside: auto; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function main() {
  const { mdPath, pdfPath } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(mdPath)) {
    console.error(`Missing markdown report: ${mdPath}`);
    process.exit(1);
  }

  const chromePath = resolveChrome();
  if (!chromePath) {
    console.error(
      "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH."
    );
    process.exit(1);
  }

  const { marked, puppeteer } = loadExportDeps();

  const markdown = fs.readFileSync(mdPath, "utf8");
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || "GLPM league run report";
  let bodyHtml = marked.parse(markdown, { gfm: true, breaks: false });
  // Wrap tables so fixed layout + wrapping CSS apply reliably.
  bodyHtml = bodyHtml.replace(
    /<table>/g,
    '<div class="table-wrap"><table class="wide-ok">'
  ).replace(/<\/table>/g, "</table></div>");

  const html = buildHtml(bodyHtml, title);
  const htmlPath = path.join(
    ROOT,
    "export",
    `${path.basename(mdPath, ".md")}.html`
  );
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html, "utf8");

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await new Promise((r) => setTimeout(r, 200));

    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "10mm", bottom: "14mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:7pt;color:#667;font-family:Helvetica,Arial,sans-serif;
          padding:0 10mm;display:flex;justify-content:space-between;">
          <span>GLPM league run</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });

    const stat = fs.statSync(pdfPath);
    console.log(
      JSON.stringify({
        input: mdPath,
        output: pdfPath,
        html: htmlPath,
        bytes: stat.size,
      })
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
