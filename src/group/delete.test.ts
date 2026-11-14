import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  createGroup,
  deleteExpense,
  editExpense,
  readGroupView,
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

describe("delete expense", () => {
  // Ana paid 30.00 for all three, Ben paid 12.00 for Ana and Ben.
  // Without the dinner, only the lunch counts: Ben +6.00, Ana −6.00.
  it("removes the expense, and balances and suggested settlements follow", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const dinner = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });
    if (!dinner.ok) throw new Error(dinner.reason);
    await addExpense(db, linkToken, {
      description: "Lunch",
      amount: "12.00",
      date: "2026-11-15",
      payerId: ben,
      participantIds: [ana, ben],
    });

    const result = await deleteExpense(db, linkToken, {
      expenseId: dinner.view.expenses[0].id,
      version: 1,
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses.map((e) => e.description)).toEqual(["Lunch"]);
    expect(result.view.members.map((m) => m.balance)).toEqual([-600, 600, 0]);
    expect(result.view.suggestedSettlements).toEqual([
      { fromId: ana, toId: ben, amount: 600 },
    ]);
    expect(await readGroupView(db, linkToken)).toEqual(result.view);
  });

  it("refuses a delete made from a version someone else has since changed, and changes nothing", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!added.ok) throw new Error(added.reason);
    const expenseId = added.view.expenses[0].id;
    const edited = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      description: "Dinner",
      amount: "40.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!edited.ok) throw new Error(edited.reason);

    expect(
      await deleteExpense(db, linkToken, { expenseId, version: 1 })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect(await readGroupView(db, linkToken)).toEqual(edited.view);
  });

  it("refuses an expense the group doesn't have, including one already deleted", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);
    const added = await addExpense(db, other.linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: other.ana,
      participantIds: [other.ana, other.ben],
    });
    if (!added.ok) throw new Error(added.reason);
    const expenseId = added.view.expenses[0].id;

    for (const id of [expenseId, "not-a-uuid"]) {
      expect(
        await deleteExpense(db, lisbon.linkToken, { expenseId: id, version: 1 })
      ).toEqual({ ok: false, reason: "expense-unknown" });
    }
    expect(await readGroupView(db, other.linkToken)).toEqual(added.view);
    await deleteExpense(db, other.linkToken, { expenseId, version: 1 });
    expect(
      await deleteExpense(db, other.linkToken, { expenseId, version: 1 })
    ).toEqual({ ok: false, reason: "expense-unknown" });
  });
});
