import { describe, expect, it } from "vitest";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";
import {
  isRelegationRank,
  standingZoneForRank,
  standingZonesForLeague,
} from "@/lib/glpm/standings-zones";

describe("standings-zones", () => {
  it("resolves zones by competition id or league name", () => {
    const byId = standingZonesForLeague({
      competitionId: SM_LEAGUE.EREDIVISIE,
    });
    expect(byId.relegationPlaces).toBe(2);
    expect(byId.championsLeague).toEqual({ from: 1, to: 2 });

    const byName = standingZonesForLeague({ leagueName: "Premier League" });
    expect(byName.relegationPlaces).toBe(3);
    expect(byName.championsLeague).toEqual({ from: 1, to: 4 });
  });

  it("maps Premier League ranks to Google-style zones", () => {
    const zones = standingZonesForLeague({
      competitionId: SM_LEAGUE.PREMIER_LEAGUE,
    });
    expect(standingZoneForRank(1, 20, zones)).toBe("champions_league");
    expect(standingZoneForRank(4, 20, zones)).toBe("champions_league");
    expect(standingZoneForRank(5, 20, zones)).toBe("europa_league");
    expect(standingZoneForRank(6, 20, zones)).toBe("conference_league");
    expect(standingZoneForRank(7, 20, zones)).toBeNull();
    expect(standingZoneForRank(17, 20, zones)).toBeNull();
    expect(standingZoneForRank(18, 20, zones)).toBe("relegation");
    expect(standingZoneForRank(20, 20, zones)).toBe("relegation");
  });

  it("flags only the bottom automatic relegation ranks", () => {
    expect(isRelegationRank(16, 18, 2)).toBe(false);
    expect(isRelegationRank(17, 18, 2)).toBe(true);
    expect(isRelegationRank(18, 18, 2)).toBe(true);
    expect(isRelegationRank(17, 20, 3)).toBe(false);
    expect(isRelegationRank(18, 20, 3)).toBe(true);
  });
});
