/** Normalize team names for fuzzy matching across SportMonks ↔ Odds API. */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/munich/g, "munchen")
    .replace(/koln|cologne/g, "koln")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(fc|afc|cf|sc|sv|ac|as|ss|us|calcio|club|de|the|united|city|town|hotspur)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): Set<string> {
  return new Set(normalizeTeamName(name).split(" ").filter((t) => t.length > 1));
}

/** Jaccard-ish overlap on significant tokens; 1 = exact normalized match. */
export function teamNameSimilarity(a: string, b: string): number {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export type NamedSides = {
  home_team: string;
  away_team: string;
  commence_time?: string;
};

/**
 * Pick the best Odds API event for a home/away pair.
 * Prefers high name similarity; ties broken by commence_time closeness.
 */
export function findMatchingEvent<T extends NamedSides>(
  events: T[],
  homeTeam: string,
  awayTeam: string,
  kickoffIso?: string | null
): { event: T; score: number } | null {
  let best: { event: T; score: number } | null = null;
  const kickoffMs = kickoffIso ? Date.parse(kickoffIso) : NaN;

  for (const event of events) {
    const homeScore = teamNameSimilarity(homeTeam, event.home_team);
    const awayScore = teamNameSimilarity(awayTeam, event.away_team);
    // Also try swapped in case home/away labeling differs (rare).
    const swappedHome = teamNameSimilarity(homeTeam, event.away_team);
    const swappedAway = teamNameSimilarity(awayTeam, event.home_team);
    const straight = Math.min(homeScore, awayScore) * 0.5 + (homeScore + awayScore) * 0.25;
    const swapped =
      Math.min(swappedHome, swappedAway) * 0.5 + (swappedHome + swappedAway) * 0.25;
    let score = Math.max(straight, swapped);

    if (Number.isFinite(kickoffMs) && event.commence_time) {
      const deltaH = Math.abs(Date.parse(event.commence_time) - kickoffMs) / 3_600_000;
      if (deltaH <= 6) score += 0.05;
      else if (deltaH > 48) score -= 0.15;
    }

    if (!best || score > best.score) {
      best = { event, score };
    }
  }

  if (!best || best.score < 0.55) return null;
  return best;
}
