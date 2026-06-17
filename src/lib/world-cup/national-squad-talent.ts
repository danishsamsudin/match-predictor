import { WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";
import {
  OFFICIAL_WC_2026_SQUADS,
  resolveWc2026TeamLabel,
} from "@/lib/data/world-cup-2026-official-squads";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import {
  GRAHAM_TALENT_SCOUTLYST_WEIGHT,
  GRAHAM_TALENT_TM_WEIGHT,
} from "@/lib/world-cup/graham-model-config";
import { tryCreateServiceClient } from "@/lib/supabase";

const TOP_LEAGUE_MARKERS = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
const DEFAULT_SQUAD_VALUE_EUR = 120_000_000;

export interface SquadTalentSnapshot {
  squadValueEur: number;
  talentRating: number;
  scoutlystValueEur: number | null;
  transfermarktValueEur: number | null;
  source: string;
}

function logTalentRating(valueEur: number, medianEur: number): number {
  if (valueEur <= 0 || medianEur <= 0) return 0;
  return Math.log(valueEur / medianEur);
}

function squadMinutesWeight(position: string, ppm: number | null): number {
  const pos = position.toUpperCase();
  let base = 1;
  if (pos.startsWith("G")) base = 0.85;
  else if (pos.startsWith("D")) base = 0.95;
  else if (pos.startsWith("M")) base = 1;
  else base = 1.05;
  const ppmBoost = ppm != null ? 0.85 + ppm / 6 : 1;
  return base * ppmBoost;
}

async function loadScoutlystSquadValue(teamId: number): Promise<number | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select("market_value_eur, rating, position")
    .eq("reference_team_id", teamId)
    .order("snapshot_date", { ascending: false })
    .limit(40);

  if (!data?.length) return null;

  let total = 0;
  let count = 0;
  for (const row of data) {
    const val = row.market_value_eur != null ? Number(row.market_value_eur) : null;
    if (val == null || !Number.isFinite(val) || val <= 0) continue;
    const w = squadMinutesWeight(row.position ?? "M", row.rating != null ? Number(row.rating) : null);
    total += val * w;
    count += w;
  }
  return count > 0 ? total / count : null;
}

async function loadTransfermarktSquadValue(teamId: number): Promise<number | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("transfermarkt_squad_snapshots")
    .select("market_value_eur, position")
    .eq("team_id", teamId)
    .order("snapshot_date", { ascending: false })
    .limit(40);

  if (!data?.length) return null;

  let total = 0;
  for (const row of data) {
    const val = row.market_value_eur != null ? Number(row.market_value_eur) : null;
    if (val == null || !Number.isFinite(val) || val <= 0) continue;
    total += val;
  }
  return total > 0 ? total : null;
}

function estimateTalentFromOfficialSquad(teamName: string): number | null {
  const squad = OFFICIAL_WC_2026_SQUADS.teams[teamName];
  if (!squad?.players?.length) return null;

  let topLeague = 0;
  for (const p of squad.players) {
    if (TOP_LEAGUE_MARKERS.some((m) => p.club.includes(m))) topLeague += 1;
  }
  const ratio = topLeague / squad.players.length;
  return DEFAULT_SQUAD_VALUE_EUR * (0.55 + ratio * 0.9);
}

export async function resolveSquadTalentSnapshot(
  teamId: number,
  teamName: string,
  medianSquadValueEur = DEFAULT_SQUAD_VALUE_EUR
): Promise<SquadTalentSnapshot> {
  const resolvedId = resolveApiTeamId(String(teamId), teamName);
  const label = resolveWc2026TeamLabel(teamName, resolvedId) ?? teamName;

  const [scoutlyst, transfermarkt] = await Promise.all([
    loadScoutlystSquadValue(resolvedId),
    loadTransfermarktSquadValue(resolvedId),
  ]);

  let squadValueEur: number;
  let source: string;

  if (transfermarkt != null && scoutlyst != null) {
    squadValueEur =
      transfermarkt * GRAHAM_TALENT_TM_WEIGHT + scoutlyst * GRAHAM_TALENT_SCOUTLYST_WEIGHT;
    source = "transfermarkt+scoutlyst";
  } else if (transfermarkt != null) {
    squadValueEur = transfermarkt;
    source = "transfermarkt";
  } else if (scoutlyst != null) {
    squadValueEur = scoutlyst;
    source = "scoutlyst";
  } else {
    squadValueEur = estimateTalentFromOfficialSquad(label) ?? medianSquadValueEur;
    source = "official_squad_proxy";
  }

  return {
    squadValueEur,
    talentRating: logTalentRating(squadValueEur, medianSquadValueEur),
    scoutlystValueEur: scoutlyst,
    transfermarktValueEur: transfermarkt,
    source,
  };
}

export async function loadMedianSquadValueForWcTeams(): Promise<number> {
  const values: number[] = [];
  for (const team of WORLD_CUP_2026_TEAMS) {
    const snap = await resolveSquadTalentSnapshot(team.id, team.name);
    if (snap.squadValueEur > 0) values.push(snap.squadValueEur);
  }
  if (!values.length) return DEFAULT_SQUAD_VALUE_EUR;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? DEFAULT_SQUAD_VALUE_EUR;
}
