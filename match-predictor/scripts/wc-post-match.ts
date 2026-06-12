/**
 * Post-match WC pipeline: ingest Opta HTML → ratings → evaluate → calibrate → sync.
 *
 * Usage: npx tsx scripts/wc-post-match.ts /path/to/article.html [...]
 */
import { spawnSync } from "node:child_process";
function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const files = process.argv.slice(2).filter((f) => f && !f.startsWith("-"));
  if (!files.length) {
    console.error("Usage: npx tsx scripts/wc-post-match.ts <file.html> [...]");
    process.exit(1);
  }

  run("npx", ["tsx", "scripts/wc-ingest-opta-html.ts", ...files]);
  run("npm", ["run", "xg-elo:recompute"]);
  run("npx", ["tsx", "scripts/wc-evaluate-predictions.ts"]);
  run("npx", ["tsx", "scripts/wc-calibrate-graham.ts"]);
  run("npm", ["run", "wc:sync"]);

  console.log("\nPost-match pipeline complete.");
}

main();
