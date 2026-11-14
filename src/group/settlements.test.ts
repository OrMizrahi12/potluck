import { describe, expect, it } from "vitest";
import { groups, settlements } from "../db/schema";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  createGroup,
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

  // Ana paid ¥3000 for all three: Ana +2000, Ben −1000, Chloé −1000.
  // Ben pays Ana ¥400, then ¥600: settled up in two instalments.
  it("accepts a partial settlement", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "3000",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    const first = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "400",
      date: "2026-11-15",
    });
    const second = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "600",
      date: "2026-11-16",
    });

    expect(first.ok && first.view.members.map((m) => m.balance)).toEqual([
      1600, -600, -1000,
    ]);
    expect(second.ok && second.view.members.map((m) => m.balance)).toEqual([
      1000, 0, -1000,
    ]);
  });

  // Ana paid ¥3000 for all three: Ana +2000, Ben −1000, Chloé −1000.
  // Ben pays Ana ¥1500, 500 more than he owed: Ana +500, Ben +500.
  it("accepts an overpayment, which leaves the member who paid it owed the difference", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "3000",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "1500",
      date: "2026-11-15",
    });

    expect(result.ok && result.view.members.map((m) => m.balance)).toEqual([
      500, 500, -1000,
    ]);
  });

  // Chloé paid ¥300 for Ana and herself: Ana −150, Chloé +150.
  // Ana lends Chloé ¥1000, recorded from lender to borrower: Ana's balance
  // crosses zero to +850 and Chloé's to −850.
  it("records a loan from lender to borrower, which can carry a balance across zero", async () => {
    const db = await createTestDb();
    const { linkToken, ana, chloe } = await lisbonGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Coffee",
      amount: "300",
      date: "2026-11-14",
      payerId: chloe,
      participantIds: [ana, chloe],
    });

    const result = await addSettlement(db, linkToken, {
      fromId: ana,
      toId: chloe,
      amount: "1000",
      date: "2026-11-15",
    });

    expect(result.ok && result.view.members.map((m) => m.balance)).toEqual([
      850, 0, -850,
    ]);
  });

  // With no expense at all, Ana pays Ben 1 + 2 + 3 + 4 = 10.00 EUR: Ana +10.00, Ben −10.00.
  it("lists settlements newest first, by date and then by when they were added", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    for (const [amount, date] of [
      ["1", "2026-11-10"],
      ["2", "2026-11-12"],
      ["3", "2026-11-09"],
      ["4", "2026-11-12"],
    ]) {
      await addSettlement(db, linkToken, {
        fromId: ana,
        toId: ben,
        amount,
        date,
      });
    }

    const view = await readGroupView(db, linkToken);

    expect(view?.settlements.map((s) => s.amount)).toEqual([
      400, 200, 100, 300,
    ]);
    expect(view?.members.map((m) => m.balance)).toEqual([1000, -1000, 0]);
  });
});

describe("add settlement refusals", () => {
  it.each([
    ["JPY", "0", "amount-not-positive"],
    ["USD", "-5.00", "amount-not-positive"],
    ["USD", "12.345", "amount-unreadable"],
    ["USD", "10000000.01", "amount-too-large"],
    ["BHD", "10000000.001", "amount-too-large"],
  ])("refuses %s %s: %s", async (currency, amount, reason) => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db, currency);

    const result = await addSettlement(db, linkToken, {
      fromId: ana,
      toId: ben,
      amount,
      date: "2026-11-14",
    });

    expect(result).toEqual({ ok: false, reason });
    expect((await readGroupView(db, linkToken))?.settlements).toEqual([]);
  });

  it.each([
    ["JPY", "10000000"],
    ["BHD", "10000000.000"],
    ["USD", "0.01"],
  ])("accepts %s %s", async (currency, amount) => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db, currency);

    const result = await addSettlement(db, linkToken, {
      fromId: ana,
      toId: ben,
      amount,
      date: "2026-11-14",
    });

    expect(result.ok).toBe(true);
  });

  it("refuses members from another group, an unreadable date and an unknown link", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);
    const settlement = {
      fromId: lisbon.ana,
      toId: lisbon.ben,
      amount: "10",
      date: "2026-11-14",
    };

    expect(
      await addSettlement(db, lisbon.linkToken, {
        ...settlement,
        fromId: other.ana,
      })
    ).toEqual({ ok: false, reason: "from-unknown" });
    expect(
      await addSettlement(db, lisbon.linkToken, {
        ...settlement,
        toId: other.ben,
      })
    ).toEqual({ ok: false, reason: "to-unknown" });
    expect(
      await addSettlement(db, lisbon.linkToken, {
        ...settlement,
        date: "2026-02-29",
      })
    ).toEqual({ ok: false, reason: "date-unreadable" });
    expect(await addSettlement(db, "A".repeat(22), settlement)).toEqual({
      ok: false,
      reason: "group-unknown",
    });
  });

  it("refuses a settlement from a member to themselves", async () => {
    const db = await createTestDb();
    const { linkToken, ana } = await lisbonGroup(db);

    const result = await addSettlement(db, linkToken, {
      fromId: ana,
      toId: ana,
      amount: "10.00",
      date: "2026-11-14",
    });

    expect(result).toEqual({ ok: false, reason: "settlement-to-self" });
    expect((await readGroupView(db, linkToken))?.settlements).toEqual([]);
  });

  it("is backed by the database, which refuses a settlement to oneself written past the service", async () => {
    const db = await createTestDb();
    const { ana } = await lisbonGroup(db);
    const [group] = await db.select({ id: groups.id }).from(groups);

    await expect(
      db.insert(settlements).values({
        groupId: group.id,
        fromId: ana,
        toId: ana,
        amount: 1000,
        date: "2026-11-14",
      })
    ).rejects.toThrow();
  });

  it("caps a group at 5,000 settlements", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    // Setup only: 4,999 settlements written straight to the table, since
    // adding them one by one through the service would take minutes.
    const [group] = await db.select({ id: groups.id }).from(groups);
    await db.insert(settlements).values(
      Array.from({ length: 4999 }, () => ({
        groupId: group.id,
        fromId: ana,
        toId: ben,
        amount: 200,
        date: "2026-01-01",
      }))
    );
    const settlement = {
      fromId: ben,
      toId: ana,
      amount: "2",
      date: "2026-11-14",
    };

    expect((await addSettlement(db, linkToken, settlement)).ok).toBe(true);
    expect(await addSettlement(db, linkToken, settlement)).toEqual({
      ok: false,
      reason: "too-many-settlements",
    });
  }, 60_000);
});
