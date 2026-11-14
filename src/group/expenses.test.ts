import { describe, expect, it } from "vitest";
import { expenseParticipants, expenses, groups } from "../db/schema";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  createGroup,
  readGroupView,
  type AddExpenseInput,
} from "./service";

/** A fresh group in `currency` with members Ana, Ben and Chloé. */
async function lisbonGroup(db: Db, currency = "EUR") {
  const created = await createGroup(db, {
    name: "Lisbon trip",
    currency,
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  if (!created.ok) throw new Error(created.reason);
  const [ana, ben, chloe] = created.view.members.map((m) => m.id);
  return { linkToken: created.view.linkToken, ana, ben, chloe };
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

describe("fnv1a32 in these tests", () => {
  it("matches the published test vectors", () => {
    // Go's hash/fnv test vectors.
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("abc")).toBe(0x1a47e90b);
  });
});

describe("add expense", () => {
  // 30.00 EUR split three ways is 10.00 each; Ana paid 30.00 and owes 10.00.
  it("shows every participant's share and every member's balance", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);

    const result = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses).toEqual([
      {
        id: expect.any(String),
        description: "Dinner",
        amount: 3000,
        date: "2026-11-14",
        payerId: ana,
        version: 1,
        shares: [
          { memberId: ana, share: 1000, extra: 0 },
          { memberId: ben, share: 1000, extra: 0 },
          { memberId: chloe, share: 1000, extra: 0 },
        ],
      },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      2000, -1000, -1000,
    ]);
  });

  // A gift: Ana paid 20.00 for Ben and Chloé, who owe 10.00 each; Ana owes nothing.
  it("splits a gift only among the participants when the payer isn't one", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);

    const result = await addExpense(db, linkToken, {
      description: "Birthday flowers",
      amount: "20",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ben, chloe],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0].shares).toEqual([
      { memberId: ben, share: 1000, extra: 0 },
      { memberId: chloe, share: 1000, extra: 0 },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      2000, -1000, -1000,
    ]);
  });

  it("lists the participants in member creation order, whatever order they're given in", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);

    const result = await addExpense(db, linkToken, {
      description: "Taxi",
      amount: "9",
      date: "2026-11-14",
      payerId: ben,
      participantIds: [chloe, ana, ben, chloe],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0].shares.map((s) => s.memberId)).toEqual([
      ana,
      ben,
      chloe,
    ]);
  });

  // Among three: 10.00 leaves 1 leftover cent, 0.05 leaves 2, 0.04 and 100.01
  // leave 1 and 2. Each goes one per participant from FNV-1a(id) mod 3, wrapping.
  it("hands leftover units out one each from FNV-1a of the expense id, in member creation order", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);

    for (const amount of ["10.00", "0.05", "0.04", "100.01"]) {
      const result = await addExpense(db, linkToken, {
        description: `Split ${amount}`,
        amount,
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben, chloe],
      });
      if (!result.ok) throw new Error(`refused: ${result.reason}`);
      const [expense] = result.view.expenses;
      const n = 3;
      const q = Math.floor(expense.amount / n);
      const r = expense.amount % n;
      const offset = fnv1a32(expense.id) % n;
      const gets = (position: number) => (position - offset + n) % n < r;

      expect(expense.shares, amount).toEqual(
        [ana, ben, chloe].map((memberId, position) => ({
          memberId,
          share: gets(position) ? q + 1 : q,
          extra: gets(position) ? 1 : 0,
        }))
      );
    }
  });

  it("gives an expense the same id and shares every time it's read", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Groceries",
      amount: "47.15",
      date: "2026-11-14",
      payerId: chloe,
      participantIds: [ana, ben, chloe],
    });
    if (!added.ok) throw new Error(added.reason);
    await addExpense(db, linkToken, {
      description: "Coffee",
      amount: "6.40",
      date: "2026-11-15",
      payerId: ben,
      participantIds: [ana, ben],
    });

    const first = await readGroupView(db, linkToken);
    const second = await readGroupView(db, linkToken);

    const groceries = (view: typeof first) =>
      view?.expenses.find((e) => e.description === "Groceries");
    expect(groceries(first)).toEqual(added.view.expenses[0]);
    expect(groceries(second)).toEqual(added.view.expenses[0]);
  });

  it("stores the description trimmed", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);

    const result = await addExpense(db, linkToken, {
      description: "  Museum tickets ",
      amount: "24",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    expect(result.ok && result.view.expenses[0].description).toBe(
      "Museum tickets"
    );
  });
});

describe("amounts", () => {
  it.each([
    // currency, typed, minor units: ISO 4217 digits, not the browser's
    ["JPY", "1000", 1000],
    ["USD", "12.34", 1234],
    ["USD", "12.3", 1230],
    ["USD", "12", 1200],
    ["USD", "12,34", 1234],
    ["USD", ".5", 50],
    ["BHD", "1.234", 1234],
    ["BHD", "0.003", 3],
    ["HUF", "12.34", 1234],
    ["HUF", "12", 1200],
  ])("reads %s %s as %d minor units", async (currency, typed, minor) => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, currency);

    const result = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: typed,
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    expect(result.ok && result.view.expenses[0].amount).toBe(minor);
  });

  it.each([
    ["JPY", "1000.5"],
    ["JPY", "1,000"],
    ["USD", "12.345"],
    ["BHD", "1.2345"],
    ["USD", "1,234.56"],
    ["USD", "12 USD"],
    ["USD", "1e3"],
    ["USD", ""],
    ["USD", "."],
  ])("refuses %s %s as unreadable", async (currency, typed) => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db, currency);

    expect(
      await addExpense(db, linkToken, {
        description: "Dinner",
        amount: typed,
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben],
      })
    ).toEqual({ ok: false, reason: "amount-unreadable" });
  });
});

describe("add expense refusals", () => {
  async function refusal(
    currency: string,
    input: (ids: { ana: string; ben: string; chloe: string }) => AddExpenseInput
  ) {
    const db = await createTestDb();
    const group = await lisbonGroup(db, currency);
    const result = await addExpense(db, group.linkToken, input(group));
    const after = await readGroupView(db, group.linkToken);
    return { result, expensesAfter: after?.expenses };
  }

  it.each([
    ["USD", "0"],
    ["USD", "0.00"],
    ["USD", "-5"],
    ["JPY", "-1"],
  ])("refuses %s %s: zero or less", async (currency, amount) => {
    expect(
      await refusal(currency, ({ ana, ben }) => ({
        description: "Refund",
        amount,
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben],
      }))
    ).toEqual({
      result: { ok: false, reason: "amount-not-positive" },
      expensesAfter: [],
    });
  });

  it.each([
    // 10,000,000 major units is the most an expense can be.
    ["JPY", "10000000", true],
    ["JPY", "10000001", false],
    ["USD", "10000000.00", true],
    ["USD", "10000000.01", false],
    ["BHD", "10000000.000", true],
    ["BHD", "10000000.001", false],
    ["USD", "99999999999999999999999", false],
  ])("caps %s at 10,000,000 major units: %s", async (currency, amount, ok) => {
    const { result } = await refusal(currency, ({ ana, ben }) => ({
      description: "Typo",
      amount,
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    }));

    expect(result.ok ? true : result.reason).toBe(ok || "amount-too-large");
  });

  it("refuses an expense whose only participant is the payer", async () => {
    expect(
      await refusal("EUR", ({ ana }) => ({
        description: "My own lunch",
        amount: "12.00",
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana],
      }))
    ).toEqual({
      result: { ok: false, reason: "participants-only-payer" },
      expensesAfter: [],
    });
  });

  it("refuses an expense with no participants", async () => {
    expect(
      await refusal("EUR", ({ ana }) => ({
        description: "Nobody's lunch",
        amount: "12.00",
        date: "2026-11-14",
        payerId: ana,
        participantIds: [],
      }))
    ).toEqual({
      result: { ok: false, reason: "participants-only-payer" },
      expensesAfter: [],
    });
  });

  // 0.02 EUR is 2 minor units: one each for two participants, too few for three.
  it("refuses an amount smaller in minor units than the number of participants", async () => {
    expect(
      await refusal("EUR", ({ ana, ben, chloe }) => ({
        description: "Gum",
        amount: "0.02",
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben, chloe],
      }))
    ).toEqual({
      result: { ok: false, reason: "amount-too-small-to-split" },
      expensesAfter: [],
    });
    const { result } = await refusal("EUR", ({ ana, ben }) => ({
      description: "Gum",
      amount: "0.02",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    }));
    expect(result.ok).toBe(true);
  });

  it("refuses a payer or participant from another group", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);

    expect(
      await addExpense(db, lisbon.linkToken, {
        description: "Dinner",
        amount: "30",
        date: "2026-11-14",
        payerId: other.ana,
        participantIds: [lisbon.ana, lisbon.ben],
      })
    ).toEqual({ ok: false, reason: "payer-unknown" });
    expect(
      await addExpense(db, lisbon.linkToken, {
        description: "Dinner",
        amount: "30",
        date: "2026-11-14",
        payerId: lisbon.ana,
        participantIds: [lisbon.ana, other.ben],
      })
    ).toEqual({ ok: false, reason: "participant-unknown" });
    expect(
      await addExpense(db, lisbon.linkToken, {
        description: "Dinner",
        amount: "30",
        date: "2026-11-14",
        payerId: "not-a-uuid",
        participantIds: [lisbon.ana, lisbon.ben],
      })
    ).toEqual({ ok: false, reason: "payer-unknown" });
  });

  it("refuses a blank description and one over 100 characters", async () => {
    for (const [description, reason] of [
      ["   ", "description-missing"],
      ["x".repeat(101), "description-too-long"],
    ]) {
      expect(
        await refusal("EUR", ({ ana, ben }) => ({
          description,
          amount: "30",
          date: "2026-11-14",
          payerId: ana,
          participantIds: [ana, ben],
        }))
      ).toEqual({ result: { ok: false, reason }, expensesAfter: [] });
    }
  });

  it.each(["2026-02-29", "2026-13-01", "14/11/2026", ""])(
    "refuses the date %s",
    async (date) => {
      expect(
        await refusal("EUR", ({ ana, ben }) => ({
          description: "Dinner",
          amount: "30",
          date,
          payerId: ana,
          participantIds: [ana, ben],
        }))
      ).toEqual({
        result: { ok: false, reason: "date-unreadable" },
        expensesAfter: [],
      });
    }
  );

  it("refuses a link no group has", async () => {
    const db = await createTestDb();
    const { ana, ben } = await lisbonGroup(db);

    expect(
      await addExpense(db, "A".repeat(22), {
        description: "Dinner",
        amount: "30",
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben],
      })
    ).toEqual({ ok: false, reason: "group-unknown" });
  });

  it("caps a group at 5,000 expenses", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    // Setup only: 4,999 expenses written straight to the tables, since adding
    // them one by one through the service would take minutes.
    const [group] = await db.select({ id: groups.id }).from(groups);
    const rows = await db
      .insert(expenses)
      .values(
        Array.from({ length: 4999 }, () => ({
          groupId: group.id,
          description: "Coffee",
          amount: 200,
          date: "2026-01-01",
          payerId: ana,
        }))
      )
      .returning({ id: expenses.id });
    await db
      .insert(expenseParticipants)
      .values(rows.map((r) => ({ expenseId: r.id, memberId: ben })));
    const coffee = {
      description: "Coffee",
      amount: "2",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    };

    expect((await addExpense(db, linkToken, coffee)).ok).toBe(true);
    expect(await addExpense(db, linkToken, coffee)).toEqual({
      ok: false,
      reason: "too-many-expenses",
    });
  }, 60_000);
});

describe("the expense list", () => {
  it("lists expenses newest first, by date and then by when they were added", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    for (const [description, date] of [
      ["Tuesday lunch", "2026-11-10"],
      ["Thursday dinner", "2026-11-12"],
      ["Monday lunch", "2026-11-09"],
      ["Thursday taxi", "2026-11-12"],
    ]) {
      await addExpense(db, linkToken, {
        description,
        amount: "10",
        date,
        payerId: ana,
        participantIds: [ana, ben],
      });
    }

    const view = await readGroupView(db, linkToken);

    expect(view?.expenses.map((e) => e.description)).toEqual([
      "Thursday taxi",
      "Thursday dinner",
      "Tuesday lunch",
      "Monday lunch",
    ]);
  });

  it("shows the newest 20 and loads older ones on demand, while balances count them all", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    for (let day = 1; day <= 25; day++) {
      await addExpense(db, linkToken, {
        description: `Day ${day}`,
        amount: "2.00",
        date: `2026-11-${String(day).padStart(2, "0")}`,
        payerId: ana,
        participantIds: [ana, ben],
      });
    }

    const first = await readGroupView(db, linkToken);
    const all = await readGroupView(db, linkToken, { expenseLimit: 40 });

    expect(first?.expenses).toHaveLength(20);
    expect(first?.expenses[0].description).toBe("Day 25");
    expect(first?.expenses[19].description).toBe("Day 6");
    expect(first?.hasOlderExpenses).toBe(true);
    expect(all?.expenses).toHaveLength(25);
    expect(all?.expenses[24].description).toBe("Day 1");
    expect(all?.hasOlderExpenses).toBe(false);
    // 25 expenses of 2.00 split in two: Ana is owed 25.00, Ben owes it.
    expect(first?.members.map((m) => m.balance)).toEqual([2500, -2500, 0]);
  }, 30_000);
});

describe("balances", () => {
  // Ana paid 0.05 for Ana and Ben: shares of 2 and 3 cents, the 3 to whoever
  // got the leftover cent. Ana's balance is 5 minus her share, Ben's minus his.
  it("count what a member paid minus their shares, and leave a member in no expense settled up", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);

    const result = await addExpense(db, linkToken, {
      description: "Bus",
      amount: "0.05",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    if (!result.ok) throw new Error(result.reason);
    const anaGotLeftover = result.view.expenses[0].shares[0].extra === 1;
    expect(result.view.members.map((m) => m.balance)).toEqual(
      anaGotLeftover ? [2, -2, 0] : [3, -3, 0]
    );
  });
});
