import fs from "node:fs";
import path from "node:path";

async function main() {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
  process.env.USE_MOCK_APIS = "false";

  const { getMatchValueOdds } = await import("../src/lib/odds-api/get-match-odds.ts");

  const samples = [
    { leagueSmId: 8, home: "Arsenal", away: "Leeds United" },
    { leagueSmId: 72, home: "Ajax", away: "NEC Nijmegen" },
    { leagueSmId: 82, home: "Augsburg", away: "Bayern Munich" },
  ];

  for (const s of samples) {
    const r = await getMatchValueOdds({
      leagueSmId: s.leagueSmId,
      homeTeamName: s.home,
      awayTeamName: s.away,
      includeExtras: false,
    });
    console.log(
      JSON.stringify({
        match: `${s.home} vs ${s.away}`,
        matched: r.matched,
        event: r.homeTeam && r.awayTeam ? `${r.homeTeam} vs ${r.awayTeam}` : null,
        rows: Object.keys(r.bookByRowId).length,
        credits: r.creditsUsedThisCall,
        rem: r.requestsRemaining,
        "1x2-home": r.bookByRowId["1x2-home"],
        src: r.sourceByRowId["1x2-home"],
        msg: r.message,
      })
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
