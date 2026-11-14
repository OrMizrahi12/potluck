import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import { addExpense, createGroup, editExpense, readGroupView } from "./service";

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

describe("edit expense", () => {
  // Before: Ana paid 30.00 for all three on the 14th: Ana +20.00, Ben and Chloé −10.00.
  // After: Ben paid 12.00 for Ana and Ben on the 15th: Ben +6.00, Ana −6.00.
  it("changes the description, amount, date, payer and participants, and the balances follow", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });
    if (!added.ok) throw new Error(added.reason);
    const { id } = added.view.expenses[0];

    const result = await editExpense(db, linkToken, {
      expenseId: id,
      version: 1,
      description: "Lunch",
      amount: "12.00",
      date: "2026-11-15",
      payerId: ben,
      participantIds: [ana, ben],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses).toEqual([
      {
        id,
        description: "Lunch",
        amount: 1200,
        date: "2026-11-15",
        payerId: ben,
        version: 2,
        shares: [
          { memberId: ana, share: 600, extra: 0 },
          { memberId: ben, share: 600, extra: 0 },
        ],
      },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([-600, 600, 0]);
    expect(result.view.suggestedSettlements).toEqual([
      { fromId: ana, toId: ben, amount: 600 },
    ]);
  });

  type Ids = { ana: string; ben: string; chloe: string };
  it.each<[string, (ids: Ids) => object, (ids: Ids) => object]>([
    [
      "description",
      () => ({ description: "Late dinner" }),
      () => ({ description: "Late dinner" }),
    ],
    ["amount", () => ({ amount: "36.00" }), () => ({ amount: 3600 })],
    ["date", () => ({ date: "2026-11-01" }), () => ({ date: "2026-11-01" })],
    [
      "payer",
      ({ chloe }) => ({ payerId: chloe }),
      ({ chloe }) => ({ payerId: chloe }),
    ],
  ])(
    "changes only the %s when only it is edited",
    async (_field, change, expected) => {
      const db = await createTestDb();
      const ids = await lisbonGroup(db);
      const { linkToken, ana, ben, chloe } = ids;
      const input = {
        description: "Dinner",
        amount: "30.00",
        date: "2026-11-14",
        payerId: ana,
        participantIds: [ana, ben, chloe],
      };
      const added = await addExpense(db, linkToken, input);
      if (!added.ok) throw new Error(added.reason);
      const before = added.view.expenses[0];

      const result = await editExpense(db, linkToken, {
        expenseId: before.id,
        version: 1,
        ...input,
        ...change(ids),
      });

      if (!result.ok) throw new Error(`refused: ${result.reason}`);
      expect(result.view.expenses[0]).toEqual({
        ...before,
        version: 2,
        shares: expect.any(Array),
        ...expected(ids),
      });
    }
  );

  // 0.10 EUR among Ana and Ben is 5 cents each, no leftover. Among all three it
  // is 3 each plus 1 leftover cent, which goes to position FNV-1a(id) mod 3:
  // possibly Ana or Ben, whom the edit didn't touch. That's accepted, and shown.
  it("shows where the leftover unit lands when the participants change", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Gum",
      amount: "0.10",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!added.ok) throw new Error(added.reason);
    const { id } = added.view.expenses[0];

    const result = await editExpense(db, linkToken, {
      expenseId: id,
      version: 1,
      description: "Gum",
      amount: "0.10",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    const offset = fnv1a32(id) % 3;
    expect(result.view.expenses[0].shares).toEqual(
      [ana, ben, chloe].map((memberId, position) => ({
        memberId,
        share: position === offset ? 4 : 3,
        extra: position === offset ? 1 : 0,
      }))
    );
  });

  // The logic prototype's "editing moves the cent": 10.00 among Ana, Ben and
  // Cai leaves 1 leftover cent. Swapping Ben for Dee, then making it 10.01,
  // moves the leftover units around; editing it back to 10.00 among Ana, Ben
  // and Cai gives back exactly the first shares, since the expense's id never
  // changes and shares depend only on the expense.
  it("gives back the same shares once an edit is undone", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Flat",
      currency: "USD",
      memberNames: ["Ana", "Ben", "Cai", "Dee"],
    });
    if (!created.ok) throw new Error(created.reason);
    const { linkToken } = created.view;
    const [ana, ben, cai, dee] = created.view.members.map((m) => m.id);
    const pizza = {
      description: "Pizza",
      amount: "10.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, cai],
    };
    const added = await addExpense(db, linkToken, pizza);
    if (!added.ok) throw new Error(added.reason);
    const [first] = added.view.expenses;

    await editExpense(db, linkToken, {
      ...pizza,
      participantIds: [ana, cai, dee],
      expenseId: first.id,
      version: 1,
    });
    await editExpense(db, linkToken, {
      ...pizza,
      amount: "10.01",
      participantIds: [ana, cai, dee],
      expenseId: first.id,
      version: 2,
    });
    const undone = await editExpense(db, linkToken, {
      ...pizza,
      expenseId: first.id,
      version: 3,
    });

    if (!undone.ok) throw new Error(`refused: ${undone.reason}`);
    expect(undone.view.expenses[0]).toEqual({ ...first, version: 4 });
    expect(undone.view.members.map((m) => m.balance)).toEqual(
      added.view.members.map((m) => m.balance)
    );
  });
});

describe("edit expense refusals", () => {
  type Ids = { ana: string; ben: string; chloe: string };

  /** Edits a 30.00 EUR dinner Ana paid for all three, and reads the group back after. */
  async function refusal(change: (ids: Ids) => object) {
    const db = await createTestDb();
    const ids = await lisbonGroup(db);
    const { linkToken, ana, ben, chloe } = ids;
    const input = {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    };
    const added = await addExpense(db, linkToken, input);
    if (!added.ok) throw new Error(added.reason);
    const result = await editExpense(db, linkToken, {
      expenseId: added.view.expenses[0].id,
      version: 1,
      ...input,
      ...change(ids),
    });
    const after = await readGroupView(db, linkToken);
    return { result, before: added.view, after };
  }

  it.each<[string, (ids: Ids) => object]>([
    ["description-missing", () => ({ description: "  " })],
    ["description-too-long", () => ({ description: "x".repeat(101) })],
    ["amount-unreadable", () => ({ amount: "12.345" })],
    ["amount-not-positive", () => ({ amount: "0" })],
    ["amount-too-large", () => ({ amount: "10000000.01" })],
    ["date-unreadable", () => ({ date: "2026-02-29" })],
    ["payer-unknown", () => ({ payerId: "not-a-member" })],
    [
      "participant-unknown",
      ({ ana }) => ({ participantIds: [ana, "not-a-member"] }),
    ],
    ["participants-only-payer", ({ ana }) => ({ participantIds: [ana] })],
    // 0.02 EUR is 2 minor units, too few for three participants.
    ["amount-too-small-to-split", () => ({ amount: "0.02" })],
  ])("refuses with %s and changes nothing", async (reason, change) => {
    const { result, before, after } = await refusal(change);

    expect(result).toEqual({ ok: false, reason });
    expect(after).toEqual(before);
  });

  it("refuses an edit made from a version someone else has since changed, and changes nothing", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const input = {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    };
    const added = await addExpense(db, linkToken, input);
    if (!added.ok) throw new Error(added.reason);
    const expenseId = added.view.expenses[0].id;
    // Ben and Chloé both open version 1; Ben saves first.
    const bens = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      ...input,
      amount: "33.00",
    });
    if (!bens.ok) throw new Error(bens.reason);

    const chloes = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      ...input,
      description: "Dinner and drinks",
    });

    expect(chloes).toEqual({ ok: false, reason: "stale-version" });
    expect(await readGroupView(db, linkToken)).toEqual(bens.view);
    expect(bens.view.expenses[0]).toMatchObject({
      description: "Dinner",
      amount: 3300,
      version: 2,
    });
  });

  it("refuses an expense id the group doesn't have", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);
    const input = {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: other.ana,
      participantIds: [other.ana, other.ben],
    };
    const added = await addExpense(db, other.linkToken, input);
    if (!added.ok) throw new Error(added.reason);

    for (const expenseId of [added.view.expenses[0].id, "not-a-uuid"]) {
      expect(
        await editExpense(db, lisbon.linkToken, {
          expenseId,
          version: 1,
          ...input,
          payerId: lisbon.ana,
          participantIds: [lisbon.ana, lisbon.ben],
        })
      ).toEqual({ ok: false, reason: "expense-unknown" });
    }
    expect(await readGroupView(db, other.linkToken)).toEqual(added.view);
  });
});

// 32-bit FNV-1a, written out independently of the engine (see expenses.test.ts).
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, "ascii")) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}
