import { SM_LEAGUE } from "@/lib/sportmonks/constants";

/** Country / flag metadata for GLPM leagues (SportMonks league ids). */
export const GLPM_LEAGUE_META: Record<
  number,
  { name: string; countryName: string; countryIso: string }
> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: {
    name: "Premier League",
    countryName: "England",
    countryIso: "gb-eng",
  },
  [SM_LEAGUE.CHAMPIONSHIP]: {
    name: "Championship",
    countryName: "England",
    countryIso: "gb-eng",
  },
  [SM_LEAGUE.EREDIVISIE]: {
    name: "Eredivisie",
    countryName: "Netherlands",
    countryIso: "nl",
  },
  [SM_LEAGUE.SERIE_A]: {
    name: "Serie A",
    countryName: "Italy",
    countryIso: "it",
  },
  [SM_LEAGUE.BUNDESLIGA]: {
    name: "Bundesliga",
    countryName: "Germany",
    countryIso: "de",
  },
};

export function leagueMetaForId(leagueId: number | null | undefined): {
  name: string;
  countryName: string;
  countryIso: string;
} {
  if (leagueId != null && GLPM_LEAGUE_META[leagueId]) {
    return GLPM_LEAGUE_META[leagueId]!;
  }
  return { name: "League", countryName: "", countryIso: "" };
}

/** Prefer known GLPM metadata; otherwise use SportMonks `payload.league`. */
export function leagueMetaFromPayload(
  leagueId: number | null | undefined,
  payload: unknown
): { name: string; countryName: string; countryIso: string } {
  const known = leagueMetaForId(leagueId);
  if (known.countryIso) return known;

  const league = (payload as { league?: { name?: string; short_code?: string } } | null)
    ?.league;
  const name = league?.name?.trim() || league?.short_code?.trim();
  if (name) return { name, countryName: known.countryName, countryIso: known.countryIso };
  return known;
}

export function countryFlagUrl(iso: string): string {
  const clean = iso.trim().toLowerCase();
  return `https://flagcdn.com/w80/${clean}.png`;
}

export function formatRoundLabel(gameweek: number | null, roundName?: string | null): string {
  if (gameweek != null && Number.isFinite(gameweek)) {
    return `Matchweek ${gameweek}`;
  }
  const raw = roundName?.trim();
  if (raw) {
    if (/^\d+$/.test(raw)) return `Matchweek ${raw}`;
    return raw;
  }
  return "Matchweek -";
}
