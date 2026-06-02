/** SofaScore-style single-letter position for sorting and display grouping. */
export function normalizePlayerPosition(pos?: string | null): "G" | "D" | "M" | "F" {
  if (!pos) return "M";
  const p = pos.trim().toUpperCase();
  if (p === "G" || p === "GK" || p.includes("GOAL")) return "G";
  if (p === "D" || p === "DEF" || p.includes("DEF") || p === "CB" || p === "LB" || p === "RB") {
    return "D";
  }
  if (p === "F" || p === "FW" || p === "FWD" || p.includes("FOR") || p.includes("ATT") || p === "ST") {
    return "F";
  }
  return "M";
}

export function positionDisplayLabel(pos?: string | null): string {
  const code = normalizePlayerPosition(pos);
  switch (code) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

const POSITION_SORT: Record<"G" | "D" | "M" | "F", number> = {
  G: 0,
  D: 1,
  M: 2,
  F: 3,
};

export function comparePlayersByPosition(
  a: { position: string | null },
  b: { position: string | null }
): number {
  const pa = POSITION_SORT[normalizePlayerPosition(a.position)];
  const pb = POSITION_SORT[normalizePlayerPosition(b.position)];
  if (pa !== pb) return pa - pb;
  return 0;
}
