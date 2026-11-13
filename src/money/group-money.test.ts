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

  // FNV-1a 32-bit of "a" is 0xe40c292c (published test vector, Go's hash/fnv),
  // 3826002220 mod 3 = 1, so the one leftover unit goes to the second participant.
  it("give the leftover unit to the participant at the expense id's hash offset", () => {
    const { shares } = computeGroupMoney({
      members: [{ id: "ana" }, { id: "ben" }, { id: "cy" }],
      expenses: [
        {
          id: "a",
          amount: 100,
          payerId: "ana",
          participantIds: ["ana", "ben", "cy"],
        },
      ],
      settlements: [],
    });

    expect(shares.get("a")).toEqual([
      { memberId: "ana", share: 33, extra: 0 },
      { memberId: "ben", share: 34, extra: 1 },
      { memberId: "cy", share: 33, extra: 0 },
    ]);
  });
});
