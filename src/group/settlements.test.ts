import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import { addExpense, addSettlement, createGroup } from "./service";

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

describe("add settlement", () => {
  // Ana paid 30.00 for all three: Ana +20.00, Ben −10.00, Chloé −10.00.
  // Ben pays Ana 10.00: Ana +10.00, Ben settled up.
  it("lists the settlement and counts it in balances", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-15",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements).toEqual([
      {
        id: expect.any(String),
        fromId: ben,
        toId: ana,
        amount: 1000,
        date: "2026-11-15",
        version: 1,
      },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([1000, 0, -1000]);
  });
});
