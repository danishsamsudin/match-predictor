import { describe, expect, it } from "vitest";
import { parseAvailabilityCsv } from "@/lib/data/sync-player-availabilities";

describe("parseAvailabilityCsv", () => {
  it("parses player_name,status rows", () => {
    const rows = parseAvailabilityCsv(`player_name,status
Erling Haaland,injured
John Doe,suspended`);
    expect(rows).toHaveLength(2);
    expect(rows[0].player_name).toBe("Erling Haaland");
    expect(rows[0].status).toBe("injured");
    expect(rows[1].status).toBe("suspended");
  });
});
