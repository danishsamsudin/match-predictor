import type { ReactNode } from "react";

export const TEAM_BETTING_INSIGHTS_GLOSSARY: Record<string, ReactNode> = {
  "FIFA rank": <>Position in the FIFA/Coca-Cola world ranking for the loaded snapshot.</>,
  "FIFA points": (
    <>Ranking points (higher = stronger). National-team Ω strength uses points vs the #1 team.</>
  ),
  "FIFA snapshot": (
    <>Publication half-year (H1 = Jan–Jun context, H2 = Jul–Dec). 2026 rows can be imported later.</>
  ),
  "Vs top 20 matches": (
    <>Finished games in the rolling window where the opponent was FIFA rank ≤ 20 at match date.</>
  ),
  "Vs top 20 record": <>Wins, draws, and losses in those top-20 opponent matches only.</>,
  "Vs top 20 PPG": <>Points per game (3/1/0) against top-20 opposition in the window.</>,
  "Vs top 20 win %": <>Win rate % against top-20 opposition in the window.</>,
  "Goal difference": (
    <>Total goals scored minus conceded across the rolling window (not season-long).</>
  ),
  "Goals scored / game": <>Average goals scored per match in the window.</>,
  "Goals conceded / game": <>Average goals conceded per match in the window.</>,
  "Clean sheet %": <>Share of matches where the team conceded zero goals.</>,
  "Failed to score %": <>Share of matches where the team scored zero goals.</>,
  "Qualifying PPG": (
    <>Points per game: win = 3, draw = 1, loss = 0, across WCQ/play-off matches in our DB.</>
  ),
  "Qualifying record": <>Wins-draws-losses in World Cup qualifying competitions only.</>,
  "Shot conversion %": <>Goals divided by total shots (FBref season totals, minutes-weighted).</>,
  "Shots on target / 90": (
    <>
      Team shots on target per 90 minutes of match time from FBref shooting
      totals (squad counts scaled to eleven players on the pitch, not summed
      player per-90 rates).
    </>
  ),
  "Crosses / 90": (
    <>
      Team crosses attempted per 90 minutes of match time from FBref
      miscellaneous stats (squad totals scaled to eleven players on the pitch).
    </>
  ),
  "Top scorer goal share": (
    <>Leading scorer&apos;s goals as a % of all team goals - higher means more talisman reliance.</>
  ),
  "GK save %": (
    <>
      Team save percentage from FBref keeper totals (saves divided by shots on
      target faced). If goals were conceded, the rate cannot read as 100%.
    </>
  ),
  "Tackles / 90": (
    <>
      Team tackles won per 90 minutes of match time from FBref miscellaneous
      stats (squad totals scaled to eleven players on the pitch).
    </>
  ),
  "Interceptions / 90": (
    <>
      Team interceptions per 90 minutes of match time from FBref miscellaneous
      stats (squad totals scaled to eleven players on the pitch).
    </>
  ),
  "Shots conceded / game": (
    <>Opponent total shots per match from synced SofaScore statistics (last 10 when available).</>
  ),
  "Average age": <>Minutes-weighted average age from FBref standard stats.</>,
  "Players used": <>Players with logged minutes in FBref standard stats.</>,
  "Penalty conversion": <>Penalties scored divided by penalties attempted (team totals).</>,
  "Yellow cards / 90": (
    <>
      Team yellow cards per 90 minutes of match time (total cards divided by squad
      minutes and scaled to eleven players on the pitch). Qualifying and friendly
      rows are combined; duplicate imports for the same player and competition are
      ignored.
    </>
  ),
};
