import { resolveTeamLogo } from "@/lib/data/team-logos";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";
import { formatRoundLabel, leagueMetaForId } from "./league-meta";
import type { LiveScoreMatch, LiveScoresBoardPayload } from "./types";

function logoFor(name: string): string | null {
  const url = resolveTeamLogo({ id: 0, name });
  return url || null;
}

/**
 * Demo cards using fields we can collect from SportMonks livescores/inplay
 * (league, venue, round, participants + logos, scores, state / minute).
 */
export function buildLiveScorePlaceholders(): LiveScoreMatch[] {
  const pl = leagueMetaForId(SM_LEAGUE.PREMIER_LEAGUE);
  const ered = leagueMetaForId(SM_LEAGUE.EREDIVISIE);
  const serie = leagueMetaForId(SM_LEAGUE.SERIE_A);

  return [
    {
      matchSmId: -1001,
      leagueName: pl.name,
      countryIso: pl.countryIso,
      countryName: pl.countryName,
      stadiumName: "Emirates Stadium",
      gameweek: 1,
      roundLabel: formatRoundLabel(1),
      homeTeamName: "Arsenal",
      awayTeamName: "Chelsea",
      homeTeamSmId: 19,
      awayTeamSmId: 18,
      homeLogoUrl: logoFor("Arsenal"),
      awayLogoUrl: logoFor("Chelsea"),
      homeScore: 2,
      awayScore: 1,
      statusLabel: "2nd Half",
      minute: 67,
      kickoffAt: null,
      isPlaceholder: true,
    },
    {
      matchSmId: -1002,
      leagueName: ered.name,
      countryIso: ered.countryIso,
      countryName: ered.countryName,
      stadiumName: "Johan Cruijff ArenA",
      gameweek: 2,
      roundLabel: formatRoundLabel(2),
      homeTeamName: "Ajax",
      awayTeamName: "PSV",
      homeTeamSmId: 629,
      awayTeamSmId: 680,
      homeLogoUrl: logoFor("Ajax"),
      awayLogoUrl: logoFor("PSV"),
      homeScore: 0,
      awayScore: 0,
      statusLabel: "1st Half",
      minute: 23,
      kickoffAt: null,
      isPlaceholder: true,
    },
    {
      matchSmId: -1003,
      leagueName: serie.name,
      countryIso: serie.countryIso,
      countryName: serie.countryName,
      stadiumName: "San Siro",
      gameweek: 1,
      roundLabel: formatRoundLabel(1),
      homeTeamName: "Inter",
      awayTeamName: "AC Milan",
      homeTeamSmId: 2930,
      awayTeamSmId: 113,
      homeLogoUrl: logoFor("Inter"),
      awayLogoUrl: logoFor("AC Milan"),
      homeScore: 1,
      awayScore: 1,
      statusLabel: "HT",
      minute: 45,
      kickoffAt: null,
      isPlaceholder: true,
    },
  ];
}

export function placeholderLiveScoresBoard(): LiveScoresBoardPayload {
  return {
    matches: buildLiveScorePlaceholders(),
    syncedAt: null,
    source: "placeholder",
  };
}
