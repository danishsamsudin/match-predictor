import type { SoccerdataSource } from "@/lib/api/soccerdata/types";

/**
 * Map our reference league ids to SoccerData league identifiers (per source).
 * SoccerData league ids are NOT consistent across sources.
 *
 * Start small: extend as we validate scrapers league-by-league.
 */
const FBREF: Record<number, string> = {
  39: "ENG-Premier League",
  140: "ESP-La Liga",
  78: "GER-Bundesliga",
  135: "ITA-Serie A",
  61: "FRA-Ligue 1",
  // 88 Eredivisie is not available in FBref out-of-the-box per docs.
};

const UNDERSTAT: Record<number, string> = {
  39: "ENG-Premier League",
  140: "ESP-La Liga",
  78: "GER-Bundesliga",
  135: "ITA-Serie A",
  61: "FRA-Ligue 1",
};

const MATCHHISTORY: Record<number, string> = {
  39: "ENG-Premier League",
  140: "ESP-La Liga",
  78: "GER-Bundesliga",
  135: "ITA-Serie A",
  61: "FRA-Ligue 1",
};

export function soccerdataLeagueIdForReference(
  source: SoccerdataSource,
  referenceLeagueId: number
): string | null {
  switch (source) {
    case "FBref":
      return FBREF[referenceLeagueId] ?? null;
    case "Understat":
      return UNDERSTAT[referenceLeagueId] ?? null;
    case "MatchHistory":
      return MATCHHISTORY[referenceLeagueId] ?? null;
    default:
      return null;
  }
}

