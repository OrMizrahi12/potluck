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

/** A fresh EUR group with members Ana and Ben. */
async function lisbonGroup(db: Db) {
  const created = await createGroup(db, {
    name: "Lisbon trip",
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  if (!created.ok) throw new Error(created.reason);
  const [ana, ben] = created.view.members.map((m) => m.id);
  return { linkToken: created.view.linkToken, ana, ben };
}

describe("group spending", () => {
  it("is zero for a new group", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    const view = await readGroupView(db, linkToken);

    expect(view?.groupSpending).toBe(0);
  });

  // 21 expenses of 2.00 EUR, one more than a page: 21 × 200 = 4200.
  it("counts every expense, whatever expense limit was asked for", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    for (let day = 1; day <= 21; day++) {
      await addExpense(db, linkToken, {
        description: `Day ${day}`,
        amount: "2.00",
        date: `2026-11-${String(day).padStart(2, "0")}`,
        payerId: ana,
        participantIds: [ana, ben],
      });
    }

    const one = await readGroupView(db, linkToken, { expenseLimit: 1 });
    const page = await readGroupView(db, linkToken);
    const all = await readGroupView(db, linkToken, { expenseLimit: 40 });

    expect(page?.hasOlderExpenses).toBe(true);
    expect(one?.groupSpending).toBe(4200);
    expect(page?.groupSpending).toBe(4200);
    expect(all?.groupSpending).toBe(4200);
  }, 30_000);

  // CHF 48.00 × 1.0463 = 50.2224 EUR, recorded as €50.22; plus €10.00 = 6022.
  it("counts an expense with a foreign amount at its group-currency amount", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "50.22",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });
    await addExpense(db, linkToken, {
      description: "Taxi",
      amount: "10.00",
      date: "2026-11-15",
      payerId: ben,
      participantIds: [ana, ben],
    });

    const view = await readGroupView(db, linkToken);

    expect(view?.groupSpending).toBe(6022);
  });

  // €30.00 + €12.00 = 4200; editing the 30.00 to 45.00 gives 5700;
  // deleting the 12.00 leaves 4500.
  it("follows an expense being edited or deleted", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    const dinner = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!dinner.ok) throw new Error(`refused: ${dinner.reason}`);
    const dinnerId = dinner.view.expenses[0].id;
    const lunch = await addExpense(db, linkToken, {
      description: "Lunch",
      amount: "12.00",
      date: "2026-11-15",
      payerId: ben,
      participantIds: [ana, ben],
    });
    if (!lunch.ok) throw new Error(`refused: ${lunch.reason}`);
    const lunchId = lunch.view.expenses[0].id;
    expect(lunch.view.groupSpending).toBe(4200);

    const edited = await editExpense(db, linkToken, {
      expenseId: dinnerId,
      version: 1,
      description: "Dinner",
      amount: "45.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!edited.ok) throw new Error(`refused: ${edited.reason}`);
    expect(edited.view.groupSpending).toBe(5700);

    const deleted = await deleteExpense(db, linkToken, {
      expenseId: lunchId,
      version: 1,
    });
    if (!deleted.ok) throw new Error(`refused: ${deleted.reason}`);
    expect(deleted.view.groupSpending).toBe(4500);
  });
});
