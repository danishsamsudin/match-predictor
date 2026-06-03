import type { TeamOption } from "@/lib/types/football-lookup";

/** Sofascore / SportAPI7 national team ids for FIFA World Cup 2026 (48 nations). */
export const WORLD_CUP_2026_TEAMS: TeamOption[] = [
  { id: 4691, name: "Algeria" },
  { id: 4819, name: "Argentina" },
  { id: 4741, name: "Australia" },
  { id: 4718, name: "Austria" },
  { id: 4717, name: "Belgium" },
  { id: 4479, name: "Bosnia & Herzegovina" },
  { id: 4748, name: "Brazil" },
  { id: 4753, name: "Cabo Verde" },
  { id: 4752, name: "Canada" },
  { id: 4820, name: "Colombia" },
  { id: 4768, name: "Côte d'Ivoire" },
  { id: 4715, name: "Croatia" },
  { id: 55827, name: "Curaçao" },
  { id: 4714, name: "Czechia" },
  { id: 4823, name: "DR Congo" },
  { id: 4757, name: "Ecuador" },
  { id: 4758, name: "Egypt" },
  { id: 4713, name: "England" },
  { id: 4481, name: "France" },
  { id: 4711, name: "Germany" },
  { id: 4764, name: "Ghana" },
  { id: 7229, name: "Haiti" },
  { id: 4766, name: "Iran" },
  { id: 4767, name: "Iraq" },
  { id: 4770, name: "Japan" },
  { id: 4771, name: "Jordan" },
  { id: 4781, name: "Mexico" },
  { id: 4778, name: "Morocco" },
  { id: 4705, name: "Netherlands" },
  { id: 4784, name: "New Zealand" },
  { id: 4475, name: "Norway" },
  { id: 5164, name: "Panama" },
  { id: 4789, name: "Paraguay" },
  { id: 4704, name: "Portugal" },
  { id: 4792, name: "Qatar" },
  { id: 4834, name: "Saudi Arabia" },
  { id: 4695, name: "Scotland" },
  { id: 4739, name: "Senegal" },
  { id: 4736, name: "South Africa" },
  { id: 4735, name: "South Korea" },
  { id: 4698, name: "Spain" },
  { id: 4688, name: "Sweden" },
  { id: 4699, name: "Switzerland" },
  { id: 4729, name: "Tunisia" },
  { id: 4700, name: "Türkiye" },
  { id: 4725, name: "Uruguay" },
  { id: 4724, name: "USA" },
  { id: 4723, name: "Uzbekistan" },
];

const NATIONAL_TEAM_NAME_ALIASES: Record<string, string> = {
  "bosnia and herzegovina": "bosnia & herzegovina",
  "bosnia-herzegovina": "bosnia & herzegovina",
  "cape verde": "cabo verde",
  "cote d'ivoire": "côte d'ivoire",
  "côte d ivoire": "côte d'ivoire",
  "curacao": "curaçao",
  "democratic republic of the congo": "dr congo",
  "congo dr": "dr congo",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "ir iran": "iran",
  "turkey": "türkiye",
  "united states": "usa",
  "united states of america": "usa",
};

export function normalizeNationalTeamName(name: string): string {
  const lower = name.trim().toLowerCase();
  return NATIONAL_TEAM_NAME_ALIASES[lower] ?? lower;
}

export function isWorldCup2026TeamName(name: string): boolean {
  const key = normalizeNationalTeamName(name);
  return WORLD_CUP_2026_TEAMS.some((t) => normalizeNationalTeamName(t.name) === key);
}
