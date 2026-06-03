import { normalizeFifaDatasetTeamName } from "@/lib/data/fifa-ranking-aliases";

export interface FifaOfficialRankingRow {
  rankingYear: number;
  semester: 1 | 2;
  rank: number;
  teamName: string;
  normalizedTeamName: string;
  totalPoints: number;
  previousPoints: number | null;
  pointsDiff: number | null;
  acronym: string | null;
  dataSource: "fifa";
  snapshotIso: string | null;
}

const ROW_RE =
  /<tr class="row-(?:even|odd)[^"]*"[^>]*>([\s\S]*?)(?=<tr class="row-|<\/tbody>)/g;

function semesterFromIso(iso: string): 1 | 2 {
  const month = Number.parseInt(iso.slice(5, 7), 10);
  return month <= 6 ? 1 : 2;
}

function yearFromIso(iso: string): number {
  return Number.parseInt(iso.slice(0, 4), 10);
}

function parseSnapshotIso(html: string): string | null {
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!next?.[1]) return null;
  try {
    const data = JSON.parse(next[1]) as {
      props?: { pageProps?: { pageData?: { ranking?: { lastUpdateDate?: string } } } };
    };
    return data.props?.pageProps?.pageData?.ranking?.lastUpdateDate ?? null;
  } catch {
    return null;
  }
}

export function parseFifaOfficialRankingHtml(html: string): FifaOfficialRankingRow[] {
  const snapshotIso = parseSnapshotIso(html);
  const rankingYear = snapshotIso ? yearFromIso(snapshotIso) : 2026;
  const semester = snapshotIso ? semesterFromIso(snapshotIso) : 1;

  const out: FifaOfficialRankingRow[] = [];
  let match: RegExpExecArray | null;

  while ((match = ROW_RE.exec(html)) !== null) {
    const row = match[0];
    const rankRaw = row.match(/rankNumber__[^>]*>(\d+)/)?.[1];
    const teamName = row.match(/teamName__[^>]*>([^<]+)</)?.[1]?.trim();
    const pointsRaw = row.match(/custom-points-cell_points__[^>]*><span>([^<]+)</)?.[1];
    const acronym =
      row.match(/fifa-world-ranking\/([A-Z0-9]{3})\?gender=men/)?.[1] ?? null;

    if (!rankRaw || !teamName || !pointsRaw) continue;

    const rank = Number.parseInt(rankRaw, 10);
    const totalPoints = Number.parseFloat(pointsRaw.replace(/,/g, ""));
    if (!Number.isFinite(rank) || rank < 1 || !Number.isFinite(totalPoints)) continue;

    out.push({
      rankingYear,
      semester,
      rank,
      teamName,
      normalizedTeamName: normalizeFifaDatasetTeamName(teamName),
      totalPoints: Math.round(totalPoints * 100) / 100,
      previousPoints: null,
      pointsDiff: null,
      acronym,
      dataSource: "fifa",
      snapshotIso,
    });
  }

  if (!out.length) {
    throw new Error("No ranking rows found in FIFA official HTML (expected tbody tr.row-even/odd)");
  }

  return out;
}
