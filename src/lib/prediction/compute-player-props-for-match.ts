import { applyCustomLineupsToTeamComparison } from "@/lib/data/apply-custom-lineups-to-comparison";
import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import type { FixtureLineup } from "@/lib/types/football";
import type { TeamComparisonSnapshot, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import {
  computePlayerPropsPayload,
  type PlayerPropsPayload,
} from "@/lib/prediction/player-props";
import { tryCreateServiceClient } from "@/lib/supabase";
import {
  computeShotProfileFromMatches,
  type ShotProfile,
} from "@/lib/world-cup/graham-shot-profiles";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import sofifaSquads from "../../../data/world-cup-2026/sofifa-squads.json";

type SofifaSquadsFile = {
  teams: Record<
    string,
    {
      setPieces?: { Penalties?: string };
    }
  >;
};

const penaltyTakersByTeamName = buildPenaltyTakerMap();

function buildPenaltyTakerMap(): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const teams = (sofifaSquads as SofifaSquadsFile).teams ?? {};
  for (const [teamName, team] of Object.entries(teams)) {
    map.set(teamName.toLowerCase(), team.setPieces?.Penalties ?? null);
  }
  return map;
}

function resolvePenaltyTaker(teamName: string, entityType: "club" | "national"): string | null {
  if (entityType !== "national") return null;
  return penaltyTakersByTeamName.get(teamName.toLowerCase()) ?? null;
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
}): Promise<TeamSquadSnapshot> {
  if (input.fromComparison && squadHasPlayers(input.fromComparison)) {
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
  teamComparison?: TeamComparisonSnapshot;
  customLineups?: FixtureLineup[];
  homeFormMatches?: InternationalFormMatch[];
  awayFormMatches?: InternationalFormMatch[];
  homeDbTeamId?: string;
  awayDbTeamId?: string;
  modelVersion?: string;
}): Promise<PlayerPropsPayload | null> {
  let comparison = input.teamComparison;

  if (input.customLineups?.length && comparison) {
    comparison = applyCustomLineupsToTeamComparison(comparison, input.customLineups);
  }

  const [homeSquad, awaySquad] = await Promise.all([
    resolveSquad({
      teamId: input.homeTeamId,
      teamName: input.homeTeamName,
      leagueId: input.homeLeagueId,
      entityType: input.entityType,
      fromComparison: comparison?.home.squad,
    }),
    resolveSquad({
      teamId: input.awayTeamId,
      teamName: input.awayTeamName,
      leagueId: input.awayLeagueId,
      entityType: input.entityType,
      fromComparison: comparison?.away.squad,
    }),
  ]);

  if (!squadHasPlayers(homeSquad) && !squadHasPlayers(awaySquad)) {
    return null;
  }

  const homeOpponentProfile = resolveShotProfile(
    input.awayDbTeamId,
    input.awayFormMatches
  );
  const awayOpponentProfile = resolveShotProfile(
    input.homeDbTeamId,
    input.homeFormMatches
  );

  const payload = computePlayerPropsPayload({
    modelVersion: input.modelVersion ?? "v2.1",
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeXg: input.homeXg,
    awayXg: input.awayXg,
    homeSquad,
    awaySquad,
    homeOpponentProfile,
    awayOpponentProfile,
    homePenaltyTaker: resolvePenaltyTaker(input.homeTeamName, input.entityType),
    awayPenaltyTaker: resolvePenaltyTaker(input.awayTeamName, input.entityType),
  });

  if (
    payload.home.anytimeScorer.length === 0 &&
    payload.away.anytimeScorer.length === 0
  ) {
    return null;
  }

  return payload;
}
