/**
 * Parses Wikipedia 2026 WC knockout combination table dump and writes
 * data/world-cup-2026/third-place-allocation-matrix.json (495 keys).
 *
 * Usage: npx tsx scripts/import-fifa-third-place-matrix.ts [path-to-wikipedia-txt]
 */

import fs from "node:fs";
import path from "node:path";

const WINNER_SLOTS = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"] as const;
const ALL_GROUPS = "ABCDEFGHIJKL".split("");

type AllocationRow = Record<string, string>;

function parseLine(line: string): { key: string; mapping: AllocationRow } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || trimmed.includes("---")) return null;
  const cells = trimmed
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  if (cells.length < 17) return null;
  const no = Number(cells[0]);
  if (!Number.isFinite(no) || no < 1 || no > 495) return null;

  const thirdSlots = cells.slice(9, 17).map((c) => c.trim());
  if (thirdSlots.length !== 8) return null;

  const advancing = new Set<string>();
  for (const slot of thirdSlots) {
    const m = slot.match(/^3([A-L])$/i);
    if (m) advancing.add(m[1].toUpperCase());
  }
  if (advancing.size !== 8) return null;

  const key = [...advancing].sort().join("");
  const mapping: AllocationRow = {};
  for (let i = 0; i < WINNER_SLOTS.length; i++) {
    const opponent = cells[i + 1]?.trim();
    if (opponent && /^[A-L]$/i.test(opponent)) {
      mapping[`WINNER_${WINNER_SLOTS[i].slice(1)}`] = opponent.toUpperCase();
      mapping[WINNER_SLOTS[i]] = `3${thirdSlots[i]?.replace(/^3/i, "") ?? opponent}`;
    }
    const third = thirdSlots[i];
    if (third) mapping[`VS_${WINNER_SLOTS[i]}`] = third;
  }

  return { key, mapping };
}

function main() {
  const inputPath =
    process.argv[2] ??
    path.join(
      process.cwd(),
      "../.cursor/projects/Users-danishsamsudin-match-predictor/agent-tools/18913074-6f3e-4f6b-94e5-65bda6bbc968.txt"
    );
  const resolvedInput = fs.existsSync(inputPath)
    ? inputPath
    : path.join(process.cwd(), "scripts/data/wikipedia-knockout-2026.txt");

  if (!fs.existsSync(resolvedInput)) {
    console.error("Input file not found:", resolvedInput);
    process.exit(1);
  }

  const text = fs.readFileSync(resolvedInput, "utf8");
  const matrix: Record<string, AllocationRow> = {};

  for (const line of text.split("\n")) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    matrix[parsed.key] = parsed.mapping;
  }

  const keys = Object.keys(matrix);
  if (keys.length !== 495) {
    console.warn(`Expected 495 keys, got ${keys.length}`);
  }

  for (const key of keys) {
    if (key.length !== 8) {
      console.warn("Invalid key length:", key);
    }
    const letters = key.split("");
    if (new Set(letters).size !== 8) {
      console.warn("Duplicate letters in key:", key);
    }
    for (const l of letters) {
      if (!ALL_GROUPS.includes(l)) console.warn("Invalid letter", l, "in", key);
    }
  }

  const outDir = path.join(process.cwd(), "data/world-cup-2026");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "third-place-allocation-matrix.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ version: "fifa-annex-c-2026", generatedAt: new Date().toISOString(), matrix }, null, 0)
  );
  console.log(`Wrote ${keys.length} combinations to ${outPath}`);
}

main();
