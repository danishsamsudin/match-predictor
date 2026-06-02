import type { ReactNode } from "react";

export const TEAM_COMPARISON_GLOSSARY: Record<string, ReactNode> = {
  "Form score": (
    <>
      Points from recent finished matches (win = 3, draw = 1), shown as a percentage of the
      maximum possible.
    </>
  ),
  "Form string": (
    <>
      Latest results in order (W = win, D = draw, L = loss). The leftmost letter is the most recent
      match.
    </>
  ),
  "Goals per game (scored)": (
    <>Average goals this team scores per match in the current season sample.</>
  ),
  "Goals per game (conceded)": (
    <>Average goals this team allows per match in the current season sample.</>
  ),
  "Corners per game": <>Average corner kicks won per match.</>,
  "Fouls per game": <>Average fouls committed per match.</>,
  "Yellow cards per game": <>Average yellow cards per match.</>,
  "Red cards per game": <>Average red cards per match.</>,
  "Shots on target per game": <>Average shots on target per match.</>,
  "Preferred formation": (
    <>The formation used most often in recent matches (e.g. 4-3-3).</>
  ),
  Stadium: (
    <>
      Home stadium name from a recent home match in <code className="text-[10px]">synced_events</code>.
      Not a generated label.
    </>
  ),
  Capacity: (
    <>
      Stadium capacity when present on a synced home fixture. We do not use a default capacity
      placeholder.
    </>
  ),
  Goals: <>Season goals in league play (from top-scorer data when available).</>,
  Appearances: <>League appearances this season (from top-scorer data when available).</>,
  Rating: (
    <>
      Player quality score from our database (SoFIFA overall or match ratings when synced). Higher is
      better.
    </>
  ),
  Position: <>Usual playing position (GK, DEF, MID, FWD).</>,
};
