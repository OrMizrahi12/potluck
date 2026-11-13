import { describe, expect, it } from "vitest";
import { computeGroupMoney } from "./group-money";

describe("an expense's shares", () => {
  it("are equal when the amount divides evenly among the participants", () => {
    const { shares } = computeGroupMoney({
      members: [{ id: "ana" }, { id: "ben" }, { id: "cy" }],
      expenses: [
        {
          id: "dinner",
          amount: 9000,
          payerId: "ana",
          participantIds: ["ana", "ben", "cy"],
        },
      ],
      settlements: [],
    });

    expect(shares.get("dinner")).toEqual([
      { memberId: "ana", share: 3000, extra: 0 },
      { memberId: "ben", share: 3000, extra: 0 },
      { memberId: "cy", share: 3000, extra: 0 },
    ]);
  });
});
