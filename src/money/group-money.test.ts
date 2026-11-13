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

  // FNV-1a 32-bit of "abc" is 0x1a47e90b (published test vector, Go's hash/fnv),
  // 440920331 mod 3 = 2, so two leftover units go to the third participant, then wrap to the first.
  it("follow member creation order, whatever order the participants are given in", () => {
    const { shares } = computeGroupMoney({
      members: [{ id: "ana" }, { id: "ben" }, { id: "cy" }],
      expenses: [
        {
          id: "abc",
          amount: 101,
          payerId: "ben",
          participantIds: ["cy", "ana", "ben"],
        },
      ],
      settlements: [],
    });

    expect(shares.get("abc")).toEqual([
      { memberId: "ana", share: 34, extra: 1 },
      { memberId: "ben", share: 33, extra: 0 },
      { memberId: "cy", share: 34, extra: 1 },
    ]);
  });
});

describe("balances", () => {
  // Shares of "a" are 33/34/33 (see the leftover-unit test above).
  it("are what each member paid for expenses minus their shares, in creation order", () => {
    const { balances } = computeGroupMoney({
      members: [{ id: "ana" }, { id: "ben" }, { id: "cy" }, { id: "dee" }],
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

    expect(balances).toEqual([
      { memberId: "ana", balance: 67 },
      { memberId: "ben", balance: -34 },
      { memberId: "cy", balance: -33 },
      { memberId: "dee", balance: 0 },
    ]);
  });

  it("add settlements made and subtract settlements received", () => {
    const { balances } = computeGroupMoney({
      members: [{ id: "ana" }, { id: "ben" }, { id: "cy" }],
      expenses: [
        {
          id: "dinner",
          amount: 9000,
          payerId: "ana",
          participantIds: ["ana", "ben", "cy"],
        },
      ],
      settlements: [
        { fromId: "ben", toId: "ana", amount: 3000 },
        { fromId: "cy", toId: "ana", amount: 5000 },
      ],
    });

    // Before settlements: ana +6000, ben -3000, cy -3000.
    expect(balances).toEqual([
      { memberId: "ana", balance: -2000 },
      { memberId: "ben", balance: 0 },
      { memberId: "cy", balance: 2000 },
    ]);
  });
});
