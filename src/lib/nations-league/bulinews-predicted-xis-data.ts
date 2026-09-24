import type { BulinewsPredictedLineups } from "@/lib/nations-league/parse-bulinews-predicted-lineups";
import predictedXisMd1 from "../../../data/nations-league-2026/NL Bulin Predicted Starting/predicted-xis-md1.json";

type PredictedXisFile = {
  fixtures?: Array<{
    fixtureId?: string | null;
    homeTeam: string;
    awayTeam: string;
    homeFormation?: string | null;
    awayFormation?: string | null;
    homePlayers: BulinewsPredictedLineups["homePlayers"];
    awayPlayers: BulinewsPredictedLineups["awayPlayers"];
    published?: boolean;
    sourceFile?: string;
  }>;
};

/**
 * Committed BuliNews predicted XIs (HTML dumps are gitignored and unavailable on Vercel).
 * Prefer this over reading local HTML at runtime.
 */
export function loadCommittedBulinewsPredictedFixtures(): BulinewsPredictedLineups[] {
  const file = predictedXisMd1 as PredictedXisFile;
  const out: BulinewsPredictedLineups[] = [];
  for (const row of file.fixtures ?? []) {
    if (row.published === false) continue;
    if (!row.homeTeam || !row.awayTeam) continue;
    if (!row.homePlayers?.length || !row.awayPlayers?.length) continue;
    out.push({
      fixtureId: row.fixtureId ?? null,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeFormation: row.homeFormation ?? null,
      awayFormation: row.awayFormation ?? null,
      homePlayers: row.homePlayers,
      awayPlayers: row.awayPlayers,
      published: true,
      sourcePath: row.sourceFile
        ? `committed:NL Bulin Predicted Starting/${row.sourceFile}`
        : "committed:predicted-xis-md1.json",
    });
  }
  return out;
}
