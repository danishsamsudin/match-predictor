import {
  applyCustomLineupToSquad,
  applyCustomLineupsToTeamComparison,
} from "@/lib/data/apply-custom-lineups-to-comparison";
import { enrichSquadPlayersWithClubScoutlyst } from "@/lib/data/enrich-squad-with-club-scoutlyst";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import type { FixtureLineup } from "@/lib/types/football";
import type { TeamComparisonSnapshot, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import {
  computePlayerPropsPayload,
  type PlayerPropsPayload,
} from "@/lib/prediction/player-props";
import {
  loadNlPlayerPropOverlays,
  loadWcPlayerPropOverlays,
} from "@/lib/prediction/player-props-wc-opta";
import { tryCreateServiceClient } from "@/lib/supabase";
import { resolveNationalPenaltyTaker } from "@/lib/nations-league/nl-penalty-takers";
import { loadNlCalibrationConfig } from "@/lib/nations-league/nl-calibration-config";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";
import {
  computeShotProfileFromMatches,
  type ShotProfile,
} from "@/lib/world-cup/graham-shot-profiles";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

function resolvePenaltyTaker(
  teamName: string,
  entityType: "club" | "national",
  tournamentSource: "world_cup" | "nations_league"
): string | null {
  if (entityType !== "national") return null;
  return resolveNationalPenaltyTaker(teamName, {
    preferNlMap: tournamentSource === "nations_league",
  });
}

function squadHasPlayers(squad: TeamSquadSnapshot): boolean {
  return squad.starters.length > 0 || squad.substitutes.length > 0;
}

async function resolveSquad(input: {
  teamId: number;
  teamName: string;
  leagueId?: number;
  entityType: "club" | "national";
  fromComparison?: TeamSquadSnapshot;
  comparisonTeamId?: number;
}): Promise<TeamSquadSnapshot> {
  if (
    input.fromComparison &&
    squadHasPlayers(input.fromComparison) &&
    (input.comparisonTeamId == null || input.comparisonTeamId === input.teamId)
  ) {
    return input.fromComparison;
  }

  const supabase = tryCreateServiceClient();
  return loadTeamSquadForComparison(
    supabase,
    input.teamId,
    input.teamName,
    input.leagueId,
    input.entityType
  );
}

function resolveShotProfile(
  teamDbId: string | undefined,
  formMatches: InternationalFormMatch[] | undefined
): ShotProfile | null {
  if (!teamDbId || !formMatches?.length) return null;
  const profile = computeShotProfileFromMatches(teamDbId, formMatches);
  if (profile.sampleWeight <= 0) return null;
  return profile;
}

export async function computePlayerPropsForMatch(input: {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeLeagueId?: number;
  awayLeagueId?: number;
  entityType: "club" | "national";
  homeXg: number;
  awayXg: number;
  homeTeamExpectedSot?: number;
  awayTeamExpectedSot?: number;
  teamComparison?: TeamComparisonSnapshot;
  customLineups?: FixtureLineup[];
  homeFormMatches?: InternationalFormMatch[];
  awayFormMatches?: InternationalFormMatch[];
  homeDbTeamId?: string;
  awayDbTeamId?: string;
  modelVersion?: string;
  homeSetPieceGoalShare?: number;
  awaySetPieceGoalShare?: number;
  homeSetPieceMult?: number;
  awaySetPieceMult?: number;
  setPieceRateThreshold?: number;
  /** Tournament overlay + calibration source for nationals. Defaults to world_cup. */
  tournamentSource?: "world_cup" | "nations_league";
}): Promise<PlayerPropsPayload | null> {
  let comparison = input.teamComparison;

  if (input.customLineups?.length && comparison) {
    comparison = applyCustomLineupsToTeamComparison(comparison, input.customLineups);
  }

  let [homeSquad, awaySquad] = await Promise.all([
    resolveSquad({
      teamId: input.homeTeamId,
      teamName: input.homeTeamName,
      leagueId: input.homeLeagueId,
      entityType: input.entityType,
      fromComparison: comparison?.home.squad,
      comparisonTeamId: comparison?.home.teamId,
    }),
    resolveSquad({
      teamId: input.awayTeamId,
      teamName: input.awayTeamName,
      leagueId: input.awayLeagueId,
      entityType: input.entityType,
      fromComparison: comparison?.away.squad,
      comparisonTeamId: comparison?.away.teamId,
    }),
  ]);

  // When teamComparison is missing (hub lock path), still pin props to the
  // projected / selected XI so markets do not leak full-roster players.
  if (input.customLineups?.length && !input.teamComparison) {
    const homeLineup = input.customLineups.find((l) => l.team.id === input.homeTeamId);
    const awayLineup = input.customLineups.find((l) => l.team.id === input.awayTeamId);
    homeSquad = applyCustomLineupToSquad(homeSquad, homeLineup);
    awaySquad = applyCustomLineupToSquad(awaySquad, awayLineup);
  }

  if (!squadHasPlayers(homeSquad) && !squadHasPlayers(awaySquad)) {
    return null;
  }

  const tournamentSource = input.tournamentSource ?? "world_cup";
  const supabase = tryCreateServiceClient();

  // Club Scoutlyst → national / BuliNews XI so stars like Kvara get real Gls/Sh/SoT.
  if (input.entityType === "national" && supabase) {
    const [homePlayers, awayPlayers] = await Promise.all([
      enrichSquadPlayersWithClubScoutlyst(supabase, [
        ...homeSquad.starters,
        ...homeSquad.substitutes,
      ]),
      enrichSquadPlayersWithClubScoutlyst(supabase, [
        ...awaySquad.starters,
        ...awaySquad.substitutes,
      ]),
    ]);
    const homeStarterIds = new Set(homeSquad.starters.map((p) => p.sofascorePlayerId));
    const awayStarterIds = new Set(awaySquad.starters.map((p) => p.sofascorePlayerId));
    homeSquad = {
      ...homeSquad,
      starters: homePlayers.filter((p) => homeStarterIds.has(p.sofascorePlayerId)),
      substitutes: homePlayers.filter((p) => !homeStarterIds.has(p.sofascorePlayerId)),
      hasScoutlystData:
        homeSquad.hasScoutlystData ||
        homePlayers.some((p) => p.scoutlystPlayerKey && !p.scoutlystPlayerKey.startsWith("bulinews:")),
    };
    awaySquad = {
      ...awaySquad,
      starters: awayPlayers.filter((p) => awayStarterIds.has(p.sofascorePlayerId)),
      substitutes: awayPlayers.filter((p) => !awayStarterIds.has(p.sofascorePlayerId)),
      hasScoutlystData:
        awaySquad.hasScoutlystData ||
        awayPlayers.some((p) => p.scoutlystPlayerKey && !p.scoutlystPlayerKey.startsWith("bulinews:")),
    };
  }

  const homeOpponentProfile = resolveShotProfile(
    input.awayDbTeamId,
    input.awayFormMatches
  );
  const awayOpponentProfile = resolveShotProfile(
    input.homeDbTeamId,
    input.homeFormMatches
  );

  const [wcOverlays, calibration] = await Promise.all([
    input.entityType === "national" && supabase
      ? tournamentSource === "nations_league"
        ? loadNlPlayerPropOverlays(supabase, [input.homeTeamId, input.awayTeamId])
        : loadWcPlayerPropOverlays(supabase, [input.homeTeamId, input.awayTeamId])
      : Promise.resolve(undefined),
    tournamentSource === "nations_league"
      ? loadNlCalibrationConfig()
      : loadWcCalibrationConfig(),
  ]);

  const payload = computePlayerPropsPayload({
    modelVersion: input.modelVersion ?? calibration.modelVersion ?? "v2.2",
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeXg: input.homeXg,
    awayXg: input.awayXg,
    homeTeamExpectedSot: input.homeTeamExpectedSot,
    awayTeamExpectedSot: input.awayTeamExpectedSot,
    homeSquad,
    awaySquad,
    homeOpponentProfile,
    awayOpponentProfile,
    homePenaltyTaker: resolvePenaltyTaker(
      input.homeTeamName,
      input.entityType,
      tournamentSource
    ),
    awayPenaltyTaker: resolvePenaltyTaker(
      input.awayTeamName,
      input.entityType,
      tournamentSource
    ),
    homeSetPieceGoalShare: input.homeSetPieceGoalShare,
    awaySetPieceGoalShare: input.awaySetPieceGoalShare,
    homeSetPieceMult: input.homeSetPieceMult,
    awaySetPieceMult: input.awaySetPieceMult,
    setPieceRateThreshold: input.setPieceRateThreshold,
    wcOverlays,
    mlCoeffs: calibration.playerPropModelCoeffs,
    marketPropCoeffs: calibration.marketModels?.playerProps,
  });

  if (
    payload.home.anytimeScorer.length === 0 &&
    payload.away.anytimeScorer.length === 0
  ) {
    return null;
  }

  return payload;
}
