/** Standard detail stats shown for every player in the expanded panel. */
export const PLAYER_DETAIL_STAT_SPECS: Array<{
  label: string;
  suffixes: string[];
}> = [
  { label: "Goals", suffixes: ["Gls", "Goals", "goals", "Goal"] },
  { label: "Assists", suffixes: ["Ast", "Assists", "assists", "Assist"] },
  { label: "xG", suffixes: ["xG", "Expected goals", "xG/90"] },
  { label: "xA", suffixes: ["xA", "Expected assists", "xA/90"] },
  { label: "Shots", suffixes: ["Shots", "Sh", "shots"] },
  { label: "Key passes", suffixes: ["KP", "Key passes", "key passes"] },
  { label: "Passes", suffixes: ["Ps", "Passes", "passes"] },
  { label: "Tackles", suffixes: ["Tk", "Tackles", "tackles"] },
  { label: "Interceptions", suffixes: ["Int", "Interceptions", "interceptions"] },
  { label: "Dribbles", suffixes: ["Drb", "Dribbles", "dribbles"] },
  { label: "Minutes", suffixes: ["Min", "Minutes", "minutes", "Mins"] },
  { label: "Appearances", suffixes: ["Apps", "Appearances", "appearances", "MP"] },
];

export type PlayerDisplayStat = {
  label: string;
  value: string;
};

function statKeyMatches(key: string, suffix: string): boolean {
  const trimmed = key.trim();
  const s = suffix.trim();
  if (trimmed === s) return true;
  if (trimmed.endsWith(` — ${s}`)) return true;
  if (trimmed.endsWith(`— ${s}`)) return true;
  return trimmed.toLowerCase().endsWith(s.toLowerCase());
}

export function findStatInRecord(
  stats: Record<string, string | number | null>,
  suffixes: string[]
): string | number | null {
  for (const suffix of suffixes) {
    for (const [key, value] of Object.entries(stats)) {
      if (!statKeyMatches(key, suffix)) continue;
      if (value == null || value === "" || value === "-") continue;
      return value;
    }
  }
  return null;
}

export function formatStatValue(value: string | number | null): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  return String(value);
}

export function buildPlayerDetailStats(
  stats: Record<string, string | number | null>
): PlayerDisplayStat[] {
  return PLAYER_DETAIL_STAT_SPECS.map(({ label, suffixes }) => ({
    label,
    value: formatStatValue(findStatInRecord(stats, suffixes)),
  }));
}
