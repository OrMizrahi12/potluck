import { describe, expect, it } from "vitest";
import { formatGroupSummary } from "./summary";

const EUR = { currency: "EUR", digits: 2 };

describe("a group summary", () => {
  it("lists spending, every member's balance and the suggested settlements", () => {
    const text = formatGroupSummary({
      groupName: "Lisbon trip",
      currency: EUR,
      locale: "en-US",
      groupSpending: 12000,
      members: [
        { name: "Ana", balance: 5000 },
        { name: "Ben", balance: -3000 },
        { name: "Cy", balance: 0 },
        { name: "Dee", balance: -2000 },
      ],
      suggestedSettlements: [
        { fromName: "Ben", toName: "Ana", amount: 3000 },
        { fromName: "Dee", toName: "Ana", amount: 2000 },
      ],
    });

    expect(text).toBe(
      [
        "Lisbon trip",
        "Group spending: €120.00",
        "",
        "Balances",
        "Ana is owed €50.00",
        "Ben owes €30.00",
        "Cy is settled up",
        "Dee owes €20.00",
        "",
        "Suggested settlements",
        "Ben pays Ana €30.00",
        "Dee pays Ana €20.00",
      ].join("\n")
    );
  });

  it("reads 'Everyone is settled up.' when there are no suggested settlements", () => {
    const text = formatGroupSummary({
      groupName: "Flat",
      currency: EUR,
      locale: "en-US",
      groupSpending: 0,
      members: [
        { name: "Ana", balance: 0 },
        { name: "Ben", balance: 0 },
      ],
      suggestedSettlements: [],
    });

    expect(text).toBe(
      [
        "Flat",
        "Group spending: €0.00",
        "",
        "Balances",
        "Ana is settled up",
        "Ben is settled up",
        "",
        "Suggested settlements",
        "Everyone is settled up.",
      ].join("\n")
    );
  });

  it("lists every member in the order given, inactive ones included", () => {
    // The input has no notion of active: an inactive member who still owes is
    // just another member in page order.
    const text = formatGroupSummary({
      groupName: "Ski week",
      currency: EUR,
      locale: "en-US",
      groupSpending: 3000,
      members: [
        { name: "Zoe", balance: 1500 },
        { name: "Finn (left)", balance: -1500 },
        { name: "Ana", balance: 0 },
      ],
      suggestedSettlements: [
        { fromName: "Finn (left)", toName: "Zoe", amount: 1500 },
      ],
    });

    expect(text.split("\n").slice(4, 7)).toEqual([
      "Zoe is owed €15.00",
      "Finn (left) owes €15.00",
      "Ana is settled up",
    ]);
  });

  it("formats amounts for a comma-decimal locale", () => {
    const text = formatGroupSummary({
      groupName: "Berlin",
      currency: EUR,
      locale: "de-DE",
      groupSpending: 123450,
      members: [
        { name: "Ana", balance: 123450 },
        { name: "Ben", balance: -123450 },
      ],
      suggestedSettlements: [
        { fromName: "Ben", toName: "Ana", amount: 123450 },
      ],
    });

    expect(text).toBe(
      [
        "Berlin",
        "Group spending: 1.234,50 €",
        "",
        "Balances",
        "Ana is owed 1.234,50 €",
        "Ben owes 1.234,50 €",
        "",
        "Suggested settlements",
        "Ben pays Ana 1.234,50 €",
      ].join("\n")
    );
  });

  // ISO 4217 gives HUF 2 decimals; browsers' CLDR data shows it with 0.
  it("uses the currency's ISO decimals where ISO and browsers disagree", () => {
    const text = formatGroupSummary({
      groupName: "Budapest",
      currency: { currency: "HUF", digits: 2 },
      locale: "en-US",
      groupSpending: 0,
      members: [{ name: "Ana", balance: 150050 }],
      suggestedSettlements: [],
    });

    expect(text.split("\n").slice(0, 5)).toEqual([
      "Budapest",
      "Group spending: HUF 0.00",
      "",
      "Balances",
      "Ana is owed HUF 1,500.50",
    ]);
  });

  it("never contains a link", () => {
    const text = formatGroupSummary({
      groupName: "Trip",
      currency: EUR,
      locale: "en-US",
      groupSpending: 1000,
      members: [
        { name: "Ana", balance: 500 },
        { name: "Ben", balance: -500 },
      ],
      suggestedSettlements: [{ fromName: "Ben", toName: "Ana", amount: 500 }],
    });

    expect(text).not.toMatch(/http|\/g\/|www\.|\w\.\w+\//);
  });
});
