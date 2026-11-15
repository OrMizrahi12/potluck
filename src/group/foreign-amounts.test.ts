import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  createGroup,
  readGroupView,
  type AddExpenseInput,
} from "./service";

/** A fresh group in `currency` with the named members. */
async function group(db: Db, currency: string, memberNames: string[]) {
  const created = await createGroup(db, {
    name: "Zermatt trip",
    currency,
    memberNames,
  });
  if (!created.ok) throw new Error(created.reason);
  return {
    linkToken: created.view.linkToken,
    ids: created.view.members.map((m) => m.id),
  };
}

// 32-bit FNV-1a, written out independently of the engine so the odd-cent
// rule can be checked against the random ids the service assigns.
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, "ascii")) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}

describe("an expense with a foreign amount", () => {
  // CHF 48.00 × 1.0463 = 50.2224 EUR, shown and sent as €50.22.
  it("stores and returns the foreign amount, its currency, the exchange rate and the group-currency amount", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben"]);
    const [ana, ben] = ids;

    const result = await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "50.22",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses).toEqual([
      {
        id: expect.any(String),
        description: "Fondue",
        amount: 5022,
        date: "2026-11-14",
        payerId: ana,
        version: 1,
        shares: [
          { memberId: ana, share: 2511, extra: 0 },
          { memberId: ben, share: 2511, extra: 0 },
        ],
        foreign: { amount: 4800, currency: "CHF", digits: 2, rate: "1.0463" },
      },
    ]);
    const read = await readGroupView(db, linkToken);
    expect(read?.expenses[0].foreign).toEqual({
      amount: 4800,
      currency: "CHF",
      digits: 2,
      rate: "1.0463",
    });
  });

  // €12.34 × 0.3765 = 4.64601 KWD, sent as 4.646: KWD has 3 digits, EUR 2.
  it("returns each currency's own minor-unit digits", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "KWD", ["Ana", "Ben"]);
    const [ana, ben] = ids;

    const result = await addExpense(db, linkToken, {
      description: "Museum",
      amount: "4.646",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "12.34", currency: "EUR", rate: "0.3765" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0].amount).toBe(4646);
    expect(result.view.expenses[0].foreign).toEqual({
      amount: 1234,
      currency: "EUR",
      digits: 2,
      rate: "0.3765",
    });
  });

  // CHF 48.01 × 1.0463 = 50.232863 EUR, sent as €50.23: 5023 cents among
  // three is 1674 each with 1 cent left over, which the odd-cent rule hands to
  // the participant at fnv1a32(id) mod 3.
  it("counts its group-currency amount in shares and balances, split by the odd-cent rule", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben", "Cai"]);
    const [ana, ben, cai] = ids;

    const result = await addExpense(db, linkToken, {
      description: "Cable car",
      amount: "50.23",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, cai],
      foreign: { amount: "48.01", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    const expense = result.view.expenses[0];
    const extraAt = fnv1a32(expense.id) % 3;
    const shares = [1674, 1674, 1674];
    shares[extraAt] += 1;
    expect(expense.shares.map((s) => s.share)).toEqual(shares);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      5023 - shares[0],
      -shares[1],
      -shares[2],
    ]);
  });

  it("is an ordinary expense when it has no foreign part, as before", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben"]);
    const [ana, ben] = ids;

    const result = await addExpense(db, linkToken, {
      description: "Groceries",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses).toStrictEqual([
      {
        id: expect.any(String),
        description: "Groceries",
        amount: 3000,
        date: "2026-11-14",
        payerId: ana,
        version: 1,
        shares: [
          { memberId: ana, share: 1500, extra: 0 },
          { memberId: ben, share: 1500, extra: 0 },
        ],
      },
    ]);
  });
});

describe("refusing an expense's foreign part", () => {
  /** Adds Ana's CHF 48.00 fondue at 1.0463 (€50.22) with `change` applied. */
  async function addWith(
    change: (input: AddExpenseInput) => AddExpenseInput,
    { currency = "EUR", names = ["Ana", "Ben"] } = {}
  ) {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, currency, names);
    const result = await addExpense(
      db,
      linkToken,
      change({
        description: "Fondue",
        amount: "50.22",
        date: "2026-11-14",
        payerId: ids[0],
        participantIds: ids,
        foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
      })
    );
    const view = await readGroupView(db, linkToken);
    return { result, view };
  }

  const withForeign =
    (foreign: Partial<NonNullable<AddExpenseInput["foreign"]>>) =>
    (input: AddExpenseInput) => ({
      ...input,
      foreign: { ...input.foreign!, ...foreign },
    });

  it("refuses a currency outside the picker, and records nothing", async () => {
    for (const currency of ["XYZ", "XAU", "chf", ""]) {
      const { result, view } = await addWith(withForeign({ currency }));
      expect(result, currency).toEqual({
        ok: false,
        reason: "foreign-currency-unknown",
      });
      expect(view?.expenses).toEqual([]);
    }
  });

  it("refuses the group currency as a foreign currency", async () => {
    const { result } = await addWith(withForeign({ currency: "EUR" }));
    expect(result).toEqual({
      ok: false,
      reason: "foreign-currency-is-group-currency",
    });
  });

  it("refuses a foreign amount that isn't a number in its currency's digits", async () => {
    // CHF has 2 digits, so 3 decimals are unreadable.
    for (const amount of ["", "abc", "48.001", "1,000"]) {
      const { result } = await addWith(withForeign({ amount }));
      expect(result, amount).toEqual({
        ok: false,
        reason: "foreign-amount-unreadable",
      });
    }
  });

  it("refuses a foreign amount that isn't more than zero", async () => {
    for (const amount of ["0", "0.00", "-48.00"]) {
      const { result } = await addWith(withForeign({ amount }));
      expect(result, amount).toEqual({
        ok: false,
        reason: "foreign-amount-not-positive",
      });
    }
  });

  it("refuses a foreign amount of more than 12 whole digits", async () => {
    const { result } = await addWith(withForeign({ amount: "1234567890123" }));
    expect(result).toEqual({ ok: false, reason: "foreign-amount-too-large" });
  });

  it("refuses an exchange rate that isn't a number", async () => {
    for (const rate of ["", "abc", "1.2.3", "1e3", ".", "1,0463"]) {
      const { result } = await addWith(withForeign({ rate }));
      expect(result, rate).toEqual({
        ok: false,
        reason: "exchange-rate-unreadable",
      });
    }
  });

  it("refuses an exchange rate that isn't more than zero", async () => {
    for (const rate of ["0", "0.000", "-1.0463"]) {
      const { result } = await addWith(withForeign({ rate }));
      expect(result, rate).toEqual({
        ok: false,
        reason: "exchange-rate-not-positive",
      });
    }
  });

  // Any rate more than zero is a real rate, however extreme.
  it("accepts an extreme exchange rate", async () => {
    // ¥100 × 25000 = €2,500,000.00.
    const { result } = await addWith((input) => ({
      ...input,
      amount: "2500000.00",
      foreign: { amount: "100", currency: "JPY", rate: "25000" },
    }));
    expect(result.ok).toBe(true);
  });
});

describe("the group-currency amount of an expense with a foreign amount", () => {
  /** Adds CHF 48.00 at 1.0463 (exactly 50.2224 EUR) for `amount`. */
  async function addFor(amount: string) {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben"]);
    return addExpense(db, linkToken, {
      description: "Fondue",
      amount,
      date: "2026-11-14",
      payerId: ids[0],
      participantIds: ids,
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });
  }

  it("is refused when it disagrees with the foreign amount and rate", async () => {
    expect(await addFor("60.00")).toEqual({
      ok: false,
      reason: "amount-disagrees-with-rate",
    });
  });

  // The half-up conversion is €50.22; one cent either side agrees.
  it("agrees within 1 minor unit of the half-up conversion", async () => {
    for (const amount of ["50.21", "50.22", "50.23"]) {
      expect((await addFor(amount)).ok, amount).toBe(true);
    }
  });

  // 0.5% of 50.2224 is 0.251112, so 49.971288 to 50.473512 agrees:
  // €49.98 and €50.47 are inside, €49.97 and €50.48 outside.
  it("agrees within 0.5% of the foreign amount × the rate, and no further", async () => {
    expect((await addFor("49.98")).ok).toBe(true);
    expect((await addFor("50.47")).ok).toBe(true);
    expect(await addFor("49.97")).toEqual({
      ok: false,
      reason: "amount-disagrees-with-rate",
    });
    expect(await addFor("50.48")).toEqual({
      ok: false,
      reason: "amount-disagrees-with-rate",
    });
  });

  // The bank charged €45.00 for $48.60: the rate worked out from it is
  // 45 ÷ 48.6 = 0.9259259259 (10 significant digits), and the expense
  // counts as the bank's €45.00.
  it("agrees with a rate worked out from a bank amount", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben"]);

    const result = await addExpense(db, linkToken, {
      description: "Hotel",
      amount: "45.00",
      date: "2026-11-14",
      payerId: ids[0],
      participantIds: ids,
      foreign: { amount: "48.60", currency: "USD", rate: "0.9259259259" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0]).toMatchObject({
      amount: 4500,
      foreign: { amount: 4860, currency: "USD", rate: "0.9259259259" },
    });
  });

  // 300,000,000,000 VND × 0.0000345 = 10,350,000 EUR: over the cap of
  // 10,000,000 EUR, though the foreign amount itself has no cap.
  it("is refused over the cap once converted", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", ["Ana", "Ben"]);

    const result = await addExpense(db, linkToken, {
      description: "Villa",
      amount: "10350000.00",
      date: "2026-11-14",
      payerId: ids[0],
      participantIds: ids,
      foreign: { amount: "300000000000", currency: "VND", rate: "0.0000345" },
    });

    expect(result).toEqual({ ok: false, reason: "amount-too-large" });
  });

  // ¥1 × 0.0062 = 0.0062 EUR, which rounds half up to €0.01: one cent
  // can't be split among four.
  it("is refused when the converted figure is too small to split", async () => {
    const db = await createTestDb();
    const { linkToken, ids } = await group(db, "EUR", [
      "Ana",
      "Ben",
      "Cai",
      "Dee",
    ]);

    const result = await addExpense(db, linkToken, {
      description: "Gum",
      amount: "0.01",
      date: "2026-11-14",
      payerId: ids[0],
      participantIds: ids,
      foreign: { amount: "1", currency: "JPY", rate: "0.0062" },
    });

    expect(result).toEqual({ ok: false, reason: "amount-too-small-to-split" });
  });
});
