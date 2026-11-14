import { sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  createGroup,
  deleteExpense,
  deleteSettlement,
  editExpense,
  editSettlement,
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

describe("delete settlement", () => {
  // Ana paid 30.00 for all three: Ana +20.00, Ben −10.00, Chloé −10.00.
  // Ben's 10.00 to Ana left him settled up; without it he owes 10.00 again.
  it("removes the settlement, and balances and suggested settlements follow", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });
    const added = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-15",
    });
    if (!added.ok) throw new Error(added.reason);
    expect(added.view.members.map((m) => m.balance)).toEqual([1000, 0, -1000]);

    const result = await deleteSettlement(db, linkToken, {
      settlementId: added.view.settlements[0].id,
      version: 1,
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements).toEqual([]);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      2000, -1000, -1000,
    ]);
    expect(result.view.suggestedSettlements).toEqual([
      { fromId: ben, toId: ana, amount: 1000 },
      { fromId: chloe, toId: ana, amount: 1000 },
    ]);
  });

  it("refuses a delete made from a version someone else has since changed, and changes nothing", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    const input = {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-15",
    };
    const added = await addSettlement(db, linkToken, input);
    if (!added.ok) throw new Error(added.reason);
    const settlementId = added.view.settlements[0].id;
    const edited = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      ...input,
      amount: "15.00",
    });
    if (!edited.ok) throw new Error(edited.reason);

    expect(
      await deleteSettlement(db, linkToken, { settlementId, version: 1 })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect(await readGroupView(db, linkToken)).toEqual(edited.view);
  });

  it("refuses a settlement the group doesn't have", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);
    const added = await addSettlement(db, other.linkToken, {
      fromId: other.ben,
      toId: other.ana,
      amount: "10.00",
      date: "2026-11-15",
    });
    if (!added.ok) throw new Error(added.reason);

    for (const settlementId of [added.view.settlements[0].id, "not-a-uuid"]) {
      expect(
        await deleteSettlement(db, lisbon.linkToken, {
          settlementId,
          version: 1,
        })
      ).toEqual({ ok: false, reason: "settlement-unknown" });
    }
    expect(await readGroupView(db, other.linkToken)).toEqual(added.view);
  });
});

describe("deleting", () => {
  // Reads the database directly, past the group service, on purpose: a hard
  // delete must leave nothing behind that the group view wouldn't show.
  it("leaves no row in any table that refers to the deleted expense or settlement", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    const expense = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });
    if (!expense.ok) throw new Error(expense.reason);
    const settlement = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-15",
    });
    if (!settlement.ok) throw new Error(settlement.reason);
    const expenseId = expense.view.expenses[0].id;
    const settlementId = settlement.view.settlements[0].id;
    // Both ids are found before deleting, so the search below can see them.
    expect(await rowsReferring(db, [expenseId, settlementId])).not.toEqual([]);

    await deleteExpense(db, linkToken, { expenseId, version: 1 });
    await deleteSettlement(db, linkToken, { settlementId, version: 1 });

    expect(await rowsReferring(db, [expenseId, settlementId])).toEqual([]);
  });
});

/**
 * Every "table.column" in the public schema holding any of `ids`, searching
 * every column whatever its type, as text: a reference stored as text or
 * inside JSON is found too.
 */
async function rowsReferring(db: Db, ids: string[]): Promise<string[]> {
  const columns = await rowsOf<{ table_name: string; column_name: string }>(
    db,
    sql`select table_name, column_name from information_schema.columns
        where table_schema = 'public' order by table_name, column_name`
  );
  const found: string[] = [];
  for (const { table_name, column_name } of columns) {
    for (const id of ids) {
      const [{ n }] = await rowsOf<{ n: number }>(
        db,
        sql`select count(*)::int as n from ${sql.identifier(table_name)}
            where position(${id} in ${sql.identifier(column_name)}::text) > 0`
      );
      if (n > 0) found.push(`${table_name}.${column_name}`);
    }
  }
  return found;
}

/** A raw query's rows. Both drivers (PGlite here, node-postgres in the app) return them as `rows`. */
async function rowsOf<Row>(db: Db, query: SQL): Promise<Row[]> {
  const result = (await db.execute(query)) as { rows: Row[] };
  return result.rows;
}
