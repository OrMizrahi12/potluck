import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  createGroup,
  readGroupView,
  type AddSettlementInput,
} from "./service";

/** A fresh group in `currency` with members Ana, Ben and Cai. */
async function zermattGroup(db: Db, currency = "EUR") {
  const created = await createGroup(db, {
    name: "Zermatt trip",
    currency,
    memberNames: ["Ana", "Ben", "Cai"],
  });
  if (!created.ok) throw new Error(created.reason);
  const [ana, ben, cai] = created.view.members.map((m) => m.id);
  return { linkToken: created.view.linkToken, ana, ben, cai };
}

describe("a settlement with a foreign amount", () => {
  // $689.09 × 0.925926 = 638.04664... EUR, shown and sent as €638.05.
  it("stores and returns the foreign amount, its currency, the exchange rate and the group-currency amount", async () => {
    const db = await createTestDb();
    const { linkToken, ana, cai } = await zermattGroup(db);

    const result = await addSettlement(db, linkToken, {
      fromId: cai,
      toId: ana,
      amount: "638.05",
      date: "2026-11-14",
      foreign: { amount: "689.09", currency: "USD", rate: "0.925926" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements).toEqual([
      {
        id: expect.any(String),
        fromId: cai,
        toId: ana,
        amount: 63805,
        date: "2026-11-14",
        version: 1,
        foreign: {
          amount: 68909,
          currency: "USD",
          digits: 2,
          rate: "0.925926",
        },
      },
    ]);
    const read = await readGroupView(db, linkToken);
    expect(read?.settlements[0].foreign).toEqual({
      amount: 68909,
      currency: "USD",
      digits: 2,
      rate: "0.925926",
    });
  });

  // Ana paid €90.00 for all three: Ana +60.00, Ben −30.00, Cai −30.00.
  // Cai hands Ana CHF 28.00 × 1.0463 = 29.2964 EUR, sent as €29.30:
  // Ana +30.70, Cai −0.70, and the balances still sum to zero.
  it("moves both members' balances by the group-currency amount", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai } = await zermattGroup(db);
    await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "90.00",
      date: "2026-11-13",
      payerId: ana,
      participantIds: [ana, ben, cai],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: cai,
      toId: ana,
      amount: "29.30",
      date: "2026-11-14",
      foreign: { amount: "28.00", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      3070, -3000, -70,
    ]);
  });

  // Yen have no minor digits: €40.00 in cash × 163.27 = ¥6530.8, sent as ¥6531.
  it("returns each currency's own minor-unit digits", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await zermattGroup(db, "JPY");

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "6531",
      date: "2026-11-14",
      foreign: { amount: "40.00", currency: "EUR", rate: "163.27" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0]).toMatchObject({
      amount: 6531,
      foreign: { amount: 4000, currency: "EUR", digits: 2, rate: "163.27" },
    });
  });

  it("is an ordinary settlement when it has no foreign part, as before", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await zermattGroup(db);

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-14",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements).toEqual([
      {
        id: expect.any(String),
        fromId: ben,
        toId: ana,
        amount: 1000,
        date: "2026-11-14",
        version: 1,
      },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([-1000, 1000, 0]);
  });
});

describe("refusing a settlement's foreign part", () => {
  /** Records Cai's $689.09 to Ana at 0.925926 (€638.05) with `change` applied. */
  async function addWith(
    change: (input: AddSettlementInput) => AddSettlementInput
  ) {
    const db = await createTestDb();
    const { linkToken, ana, cai } = await zermattGroup(db);
    const result = await addSettlement(
      db,
      linkToken,
      change({
        fromId: cai,
        toId: ana,
        amount: "638.05",
        date: "2026-11-14",
        foreign: { amount: "689.09", currency: "USD", rate: "0.925926" },
      })
    );
    const view = await readGroupView(db, linkToken);
    return { result, view };
  }

  const withForeign =
    (foreign: Partial<NonNullable<AddSettlementInput["foreign"]>>) =>
    (input: AddSettlementInput) => ({
      ...input,
      foreign: { ...input.foreign!, ...foreign },
    });

  it.each([
    [
      "a currency outside the picker",
      { currency: "XYZ" },
      "foreign-currency-unknown",
    ],
    [
      "the group currency",
      { currency: "EUR" },
      "foreign-currency-is-group-currency",
    ],
    // USD has 2 digits, so 3 decimals are unreadable.
    [
      "an unreadable foreign amount",
      { amount: "689.091" },
      "foreign-amount-unreadable",
    ],
    [
      "a foreign amount of zero",
      { amount: "0.00" },
      "foreign-amount-not-positive",
    ],
    [
      "a negative foreign amount",
      { amount: "-689.09" },
      "foreign-amount-not-positive",
    ],
    [
      "a foreign amount of 13 whole digits",
      { amount: "1234567890123" },
      "foreign-amount-too-large",
    ],
    [
      "an unreadable exchange rate",
      { rate: "1e3" },
      "exchange-rate-unreadable",
    ],
    ["an exchange rate of zero", { rate: "0" }, "exchange-rate-not-positive"],
  ] as const)("refuses %s, and records nothing", async (_, foreign, reason) => {
    const { result, view } = await addWith(withForeign(foreign));
    expect(result).toEqual({ ok: false, reason });
    expect(view?.settlements).toEqual([]);
  });

  it("refuses a group-currency amount that disagrees with the foreign amount and rate", async () => {
    const { result } = await addWith((input) => ({
      ...input,
      amount: "700.00",
    }));
    expect(result).toEqual({ ok: false, reason: "amount-disagrees-with-rate" });
  });

  // The cash was $689.09 and the bank charged €640.00: the rate worked out
  // from it is 640 ÷ 689.09 = 0.9287611197 (10 significant digits).
  it("accepts a rate worked out from a bank amount", async () => {
    const { result } = await addWith((input) => ({
      ...input,
      amount: "640.00",
      foreign: { amount: "689.09", currency: "USD", rate: "0.9287611197" },
    }));
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0]).toMatchObject({
      amount: 64000,
      foreign: { amount: 68909, rate: "0.9287611197" },
    });
  });

  // ¥1 × 0.0042 = 0.0042 EUR, which rounds half up to €0.00.
  it("refuses a foreign amount that converts to zero", async () => {
    const { result, view } = await addWith((input) => ({
      ...input,
      amount: "0.00",
      foreign: { amount: "1", currency: "JPY", rate: "0.0042" },
    }));
    expect(result).toEqual({
      ok: false,
      reason: "foreign-amount-converts-to-zero",
    });
    expect(view?.settlements).toEqual([]);
  });

  // 300,000,000,000 VND × 0.0000345 = 10,350,000 EUR: over the cap of
  // 10,000,000 EUR, though the foreign amount itself has no cap.
  it("refuses a foreign amount that converts to more than the cap", async () => {
    const { result } = await addWith((input) => ({
      ...input,
      amount: "10350000.00",
      foreign: { amount: "300000000000", currency: "VND", rate: "0.0000345" },
    }));
    expect(result).toEqual({ ok: false, reason: "amount-too-large" });
  });
});

describe("a suggested settlement switched to another currency", () => {
  // Ana paid €90.00 for all three: Ben owes €30.00, the suggested figure.
  // Worked backwards: €30.00 ÷ 1.0463 = 28.672465… CHF, proposed as CHF 28.67,
  // and the group-currency amount stays €30.00.
  it("leaves both members settled up", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai } = await zermattGroup(db);
    await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "90.00",
      date: "2026-11-13",
      payerId: ana,
      participantIds: [ana, ben, cai],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "30.00",
      date: "2026-11-14",
      foreign: { amount: "28.67", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => m.balance)).toEqual([3000, 0, -3000]);
  });

  // Ana paid ¥3003 for all three: Ben owes ¥1001, the suggested figure.
  // Worked backwards at 1 EUR = 160 JPY: ¥1001 ÷ 160 = 6.25625 EUR, proposed
  // as €6.26. Forward again that's 6.26 × 160 = ¥1001.6, so ¥1002, one yen
  // off; the group-currency amount still stays the suggested ¥1001.
  it("leaves both members settled up when converting forward again is a minor unit off", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai } = await zermattGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "3003",
      date: "2026-11-13",
      payerId: ana,
      participantIds: [ana, ben, cai],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "1001",
      date: "2026-11-14",
      foreign: { amount: "6.26", currency: "EUR", rate: "160" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => m.balance)).toEqual([1001, 0, -1001]);
  });
});
