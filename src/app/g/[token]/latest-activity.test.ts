import { describe, expect, it } from "vitest";
import { latestActivityDate } from "./latest-activity";

describe("latestActivityDate", () => {
  it("returns undefined for a group with no expenses or settlements", () => {
    expect(
      latestActivityDate({ expenses: [], settlements: [] })
    ).toBeUndefined();
  });

  it("returns the newest expense date when there are no settlements", () => {
    expect(
      latestActivityDate({
        expenses: [
          {
            id: "e1",
            description: "Dinner",
            amount: 3000,
            date: "2026-10-08",
            payerId: "m1",
            version: 1,
            shares: [],
          },
        ],
        settlements: [],
      })
    ).toBe("2026-10-08");
  });

  it("returns the settlement date when a settlement is newer than the latest expense", () => {
    expect(
      latestActivityDate({
        expenses: [
          {
            id: "e1",
            description: "Rent",
            amount: 240000,
            date: "2026-10-08",
            payerId: "m1",
            version: 1,
            shares: [],
          },
        ],
        settlements: [
          {
            id: "s1",
            fromId: "m2",
            toId: "m1",
            amount: 50000,
            date: "2026-10-21",
            version: 1,
          },
        ],
      })
    ).toBe("2026-10-21");
  });
});
