import { describe, expect, it } from "vitest";
import {
  positionDisplayLabelFromTokens,
  resolveSquadPlayerLineupRole,
} from "@/lib/data/normalize-player-position";

describe("positionDisplayLabelFromTokens", () => {
  it("prefers FWD when winger tokens include LW/LM", () => {
    expect(positionDisplayLabelFromTokens("LW", "LM", "CAM")).toBe("FWD");
    expect(positionDisplayLabelFromTokens("LS", "ST")).toBe("FWD");
  });

  it("maps fullbacks to DEF", () => {
    expect(positionDisplayLabelFromTokens("RB", "RM")).toBe("DEF");
  });
});

describe("resolveSquadPlayerLineupRole", () => {
  it("ignores SUB and uses natural position", () => {
    expect(
      resolveSquadPlayerLineupRole({ position: "SUB", fieldPosition: "ST" })
    ).toBe("F");
  });
});
