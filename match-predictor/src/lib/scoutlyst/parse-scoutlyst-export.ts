import { parseCsvLine } from "@/lib/scoutlyst/parse-csv";

export type ParsedScoutlystExport = {
  columnKeys: string[];
  rows: Record<string, string>[];
  exportedAt: string | null;
  metricsLabel: string | null;
};

function parseCsvRows(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const out: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    out.push(parseCsvLine(line));
  }
  return out;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const joined = row.join(",");
    if (row.includes("Name") && row.includes("Team") && (row.includes("POS") || row.includes("Pos"))) {
      return i;
    }
    if (joined.includes("POS") && joined.includes("Name") && joined.includes("Team")) {
      return i;
    }
  }
  return -1;
}

function buildColumnKeys(rows: string[][], headerIdx: number): string[] {
  const g1 = rows[headerIdx - 2] ?? [];
  const g2 = rows[headerIdx - 1] ?? [];
  const headers = rows[headerIdx] ?? [];
  const keys: string[] = [];
  let lastG1 = "";
  let lastG2 = "";

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").trim();
    const g1p = ((g1[i] ?? "").trim() || lastG1).trim();
    const g2p = ((g2[i] ?? "").trim() || lastG2).trim();
    if ((g1[i] ?? "").trim()) lastG1 = (g1[i] ?? "").trim();
    if ((g2[i] ?? "").trim()) lastG2 = (g2[i] ?? "").trim();

    const parts: string[] = [];
    for (const p of [g1p, g2p, h]) {
      if (p && (!parts.length || p !== parts[parts.length - 1])) parts.push(p);
    }
    let key = parts.join(" — ") || `col_${i}`;
    if (keys.includes(key)) key = `${key} (${i})`;
    keys.push(key);
  }

  return keys;
}

function parseExportedAt(text: string): string | null {
  const m = text.match(/Exported at:\s*(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] ?? null;
}

function parseMetricsLabel(rows: string[][]): string | null {
  for (const row of rows.slice(0, 8)) {
    const line = row.join(" ").trim();
    if (line.includes("/90 metrics")) return line;
  }
  return null;
}

/** Parse Scoutlyst multi-row-header player export CSV. */
export function parseScoutlystExport(csvText: string): ParsedScoutlystExport {
  const matrix = parseCsvRows(csvText);
  const headerIdx = findHeaderRowIndex(matrix);
  if (headerIdx < 0) {
    return { columnKeys: [], rows: [], exportedAt: parseExportedAt(csvText), metricsLabel: null };
  }

  const columnKeys = buildColumnKeys(matrix, headerIdx);
  const dataRows = matrix.slice(headerIdx + 1);
  const rows: Record<string, string>[] = [];

  for (const cells of dataRows) {
    if (!cells.some((c) => c.trim())) continue;
    const record: Record<string, string> = {};
    for (let i = 0; i < columnKeys.length; i++) {
      record[columnKeys[i]] = (cells[i] ?? "").trim();
    }
    const playerName = pickColumn(record, columnKeys, "Name");
    if (!playerName || playerName === "-" || playerName.toLowerCase() === "name") continue;
    rows.push(record);
  }

  return {
    columnKeys,
    rows,
    exportedAt: parseExportedAt(csvText),
    metricsLabel: parseMetricsLabel(matrix),
  };
}

export function pickColumn(
  row: Record<string, string>,
  columnKeys: string[],
  ...suffixes: string[]
): string | undefined {
  for (const suffix of suffixes) {
    const key = columnKeys.find(
      (k) => k === suffix || k.endsWith(`— ${suffix}`) || k.endsWith(` — ${suffix}`)
    );
    if (key && row[key]?.trim() && row[key] !== "-") return row[key].trim();
  }
  return undefined;
}
