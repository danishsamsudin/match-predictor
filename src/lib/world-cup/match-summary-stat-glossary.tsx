import type { ReactNode } from "react";

export const WC_MATCH_SUMMARY_SOURCE_INFO: ReactNode = (
  <>
    Post-match numbers are supplied by <strong>Opta</strong> and synced into this app after the
    final whistle. Event counts (shots, passes, tackles, cards, etc.) come from live match coding.
    <strong> Expected goals (xG)</strong> is modelled from shot location, type, and situation rather
    than counted directly on the pitch.
  </>
);

export const WC_MATCH_SUMMARY_STAT_GLOSSARY: Record<string, ReactNode> = {
  possession: (
    <>
      Share of time each team had the ball, expressed as a percentage. Opta tracks possession from
      in-play sequences and attributes it to the team in control.
    </>
  ),
  xg: (
    <>
      <strong>Expected goals (xG)</strong> estimates how many goals a team should score from the
      chances they created. A value around <strong>1.00</strong> means roughly one goal&apos;s worth
      of chances. Opta models this from shot location, type, and context.
    </>
  ),
  shots: <>Total attempts at goal, including blocked shots and misses. Opta codes every shot event.</>,
  sot: (
    <>
      Shots that would have gone into the goal without a save or a last-ditch block on the line.
    </>
  ),
  corners: <>Corner kicks won — awarded when the ball last touched a defender before crossing the goal line.</>,
  passes: <>Completed and attempted passes during open play and restarts, as coded by Opta.</>,
  passAcc: (
    <>
      Percentage of attempted passes that successfully reached a teammate. Calculated as successful
      passes divided by total passes.
    </>
  ),
  fouls: <>Fouls committed and recorded by the referee, as coded by Opta analysts.</>,
  yellow: <>Cautions shown by the referee. Two yellows for the same player result in a red card.</>,
  red: <>Sending-offs — the cautioned player leaves the pitch and the team plays with one fewer player.</>,
  offsides: (
    <>
      Offside decisions given against a team when an attacker is beyond the second-last defender at
      the moment the ball is played.
    </>
  ),
  tackles: (
    <>
      Times a player wins the ball from an opponent via a legal challenge on the ground. Opta
      distinguishes tackles from interceptions and clearances.
    </>
  ),
  interceptions: (
    <>
      When a player reads a pass and cuts it out without a direct tackle on the opponent in
      possession.
    </>
  ),
};

export const WC_MATCH_SUMMARY_STAT_GROUPS: Array<{
  id: string;
  title: string;
  keys: string[];
}> = [
  {
    id: "featured",
    title: "Key metrics",
    keys: ["xg", "possession", "shots", "sot"],
  },
  {
    id: "passing",
    title: "Passing & territory",
    keys: ["passes", "passAcc", "corners"],
  },
  {
    id: "defence",
    title: "Defence",
    keys: ["tackles", "interceptions", "offsides"],
  },
  {
    id: "discipline",
    title: "Discipline",
    keys: ["fouls", "yellow", "red"],
  },
];
