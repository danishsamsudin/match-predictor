import { normalizeFifaDatasetTeamName } from "@/lib/data/fifa-ranking-aliases";

export interface SofascoreFifaRankingRow {
  rankingYear: number;
  semester: 1 | 2;
  rank: number;
  teamName: string;
  normalizedTeamName: string;
  totalPoints: number;
  previousPoints: number | null;
  pointsDiff: number | null;
  acronym: string | null;
  sofascoreTeamId: number | null;
  dataSource: "sofascore";
}

interface SofascoreRankingRowRaw {
  name?: string;
  position?: number;
  points?: number;
  previousPoints?: number;
  previousPosition?: number;
  updatedAtTimestamp?: number;
  team?: { id?: number; name?: string; nameCode?: string };
}

function semesterFromTimestamp(ts: number): 1 | 2 {
  const date = new Date(ts * 1000);
  const month = date.getUTCMonth() + 1;
  return month <= 6 ? 1 : 2;
}

function yearFromTimestamp(ts: number): number {
  return new Date(ts * 1000).getUTCFullYear();
}

export function parseSofascoreFifaRankingsHtml(html: string): SofascoreFifaRankingRow[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    throw new Error("Could not find __NEXT_DATA__ in Sofascore FIFA rankings HTML");
  }

  const data = JSON.parse(match[1]) as {
    props?: {
      pageProps?: {
        initialProps?: {
          initialRankingsData?: { rankingRows?: SofascoreRankingRowRaw[] };
        };
      };
    };
  };

  const rawRows = data.props?.pageProps?.initialProps?.initialRankingsData?.rankingRows;
  if (!rawRows?.length) {
    throw new Error("No rankingRows in Sofascore __NEXT_DATA__");
  }

  const sampleTs =
    rawRows.find((r) => r.updatedAtTimestamp)?.updatedAtTimestamp ?? Date.now() / 1000;
  const rankingYear = yearFromTimestamp(sampleTs);
  const semester = semesterFromTimestamp(sampleTs);

  const out: SofascoreFifaRankingRow[] = [];

  for (const row of rawRows) {
    const teamName = (row.name ?? row.team?.name ?? "").trim();
    const rank = row.position;
    const points = row.points;
    if (!teamName || rank == null || points == null || rank < 1) continue;

    const prev = row.previousPoints ?? null;
    const diff = prev != null ? Math.round((points - prev) * 100) / 100 : null;

    out.push({
      rankingYear,
      semester,
      rank,
      teamName,
      normalizedTeamName: normalizeFifaDatasetTeamName(teamName),
      totalPoints: Math.round(points * 100) / 100,
      previousPoints: prev != null ? Math.round(prev * 100) / 100 : null,
      pointsDiff: diff,
      acronym: row.team?.nameCode ?? null,
      sofascoreTeamId: row.team?.id ?? null,
      dataSource: "sofascore",
    });
  }

  return out;
}
