/** Split Scoutlyst / SofaScore multi-position strings (e.g. "AM CF", "FW,MF"). */
export function parseTacticalPositionTokens(pos?: string | null): string[] {
  if (!pos) return [];
  return pos
    .split(/[,/\s·]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** Use the first tactical token for legacy callers. */
export function primaryPositionToken(pos?: string | null): string {
  const tokens = parseTacticalPositionTokens(pos);
  return tokens[0] ?? "";
}

const BROAD_PRIORITY: Array<"G" | "D" | "F" | "M"> = ["G", "D", "F", "M"];

function normalizeSinglePositionToken(token: string): "G" | "D" | "M" | "F" {
  const p = token.toUpperCase();
  if (p === "G" || p === "GK" || p.includes("GOAL")) return "G";
  if (
    p === "D" ||
    p === "DF" ||
    p === "DEF" ||
    p.includes("DEF") ||
    p === "CB" ||
    p.endsWith("CB") ||
    p === "LB" ||
    p === "RB" ||
    p.endsWith("B") && (p.startsWith("L") || p.startsWith("R")) && p.length <= 3
  ) {
    return "D";
  }
  if (
    p === "F" ||
    p === "FW" ||
    p === "FWD" ||
    p.includes("FOR") ||
    p.includes("ATT") ||
    p === "ST" ||
    p === "CF" ||
    p === "SS" ||
    p === "LW" ||
    p === "RW" ||
    p === "LF" ||
    p === "RF" ||
    p === "LS" ||
    p === "RS" ||
    p.endsWith("W")
  ) {
    return "F";
  }
  if (
    p === "DM" ||
    p === "CDM" ||
    p === "CM" ||
    p === "AM" ||
    p === "CAM" ||
    p === "LM" ||
    p === "RM" ||
    p.includes("MID") ||
    p === "MF"
  ) {
    return "M";
  }
  if (p === "WB" || p === "LWB" || p === "RWB") {
    return "D";
  }
  return "M";
}

/** SofaScore-style single-letter position for sorting and display grouping. */
export function normalizePlayerPosition(pos?: string | null): "G" | "D" | "M" | "F" {
  if (!pos) return "M";
  const tokens = parseTacticalPositionTokens(pos);
  if (!tokens.length) return "M";

  const roles = new Set(tokens.map((t) => normalizeSinglePositionToken(t)));
  for (const role of BROAD_PRIORITY) {
    if (roles.has(role)) return role;
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

/** Broad GK/DEF/MID/FWD label from SoFIFA natural + tactical tokens (F beats M for wingers). */
export function positionDisplayLabelFromTokens(
  ...values: Array<string | null | undefined>
): string {
  const roles = new Set<"G" | "D" | "M" | "F">();
  for (const value of values) {
    for (const token of parseTacticalPositionTokens(value)) {
      roles.add(normalizeSinglePositionToken(token));
    }
  }
  for (const role of BROAD_PRIORITY) {
    if (!roles.has(role)) continue;
    return positionDisplayLabel(
      role === "G" ? "GK" : role === "D" ? "CB" : role === "F" ? "ST" : "CM"
    );
  }
  return "MID";
}

const POSITION_SORT: Record<"G" | "D" | "M" | "F", number> = {
  G: 0,
  D: 1,
  M: 2,
  F: 3,
};

/** Lineup role for xG/LAV — ignores bench "SUB" labels. */
export function resolveSquadPlayerLineupRole(input: {
  fieldPosition?: string | null;
  position?: string | null;
}): "G" | "D" | "M" | "F" {
  const slot = input.fieldPosition?.trim();
  const display = input.position?.trim();
  const tactical =
    slot && slot !== "SUB" ? slot : display && display !== "SUB" ? display : null;
  return normalizePlayerPosition(tactical);
}

export function comparePlayersByPosition(
  a: { position: string | null },
  b: { position: string | null }
): number {
  const pa = POSITION_SORT[normalizePlayerPosition(a.position)];
  const pb = POSITION_SORT[normalizePlayerPosition(b.position)];
  if (pa !== pb) return pa - pb;
  return 0;
}
