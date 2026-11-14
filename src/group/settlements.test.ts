import { describe, expect, it } from "vitest";
import { groups, settlements } from "../db/schema";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  createGroup,
  deleteSettlement,
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
  it("accepts a settlement larger than the balance, which leaves the member who paid it owed the difference", async () => {
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
  // Ana lends Chloé ¥1000, recorded from the member who lent to the member who borrowed: Ana's balance
  // crosses zero to +850 and Chloé's to −850.
  it("records a loan from the member who lent to the member who borrowed, which can carry a balance across zero", async () => {
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

describe("suggested settlements", () => {
  // Ana paid ¥3000 for all three: Ana +2000, Ben −1000, Chloé −1000.
  it("have every member who owes pay the member who is owed", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, "JPY");

    const result = await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "3000",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    expect(result.ok && result.view.suggestedSettlements).toEqual([
      { fromId: ben, toId: ana, amount: 1000 },
      { fromId: chloe, toId: ana, amount: 1000 },
    ]);
  });

  // Spec #1's known non-minimal case: balances +20, +40, +30, −50, −40 give 4
  // suggestions, where three would do (Dee pays Ana 20 and Cy 30, Eli pays
  // Ben 40). Greedy by hand: Dee (−50) pays
  // Ben (+40) 40; Eli (−40) pays Cy (+30) 30; Dee and Eli now both owe 10 and
  // Ana is owed 20, so Dee (earlier-created) pays Ana first, then Eli.
  it("match the member who owes most with the member who is owed most, which may take more than the fewest", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Flat",
      currency: "JPY",
      memberNames: ["Ana", "Ben", "Cy", "Dee", "Eli"],
    });
    if (!created.ok) throw new Error(created.reason);
    const { linkToken } = created.view;
    const [ana, ben, cy, dee, eli] = created.view.members.map((m) => m.id);
    // Settlements that leave Ana +20, Ben +40, Cy +30, Dee −50, Eli −40.
    for (const [fromId, toId, amount] of [
      [ana, dee, "20"],
      [ben, dee, "30"],
      [ben, eli, "10"],
      [cy, eli, "30"],
    ]) {
      await addSettlement(db, linkToken, {
        fromId,
        toId,
        amount,
        date: "2026-11-14",
      });
    }

    const view = await readGroupView(db, linkToken);

    expect(view?.members.map((m) => m.balance)).toEqual([20, 40, 30, -50, -40]);
    expect(view?.suggestedSettlements).toEqual([
      { fromId: dee, toId: ben, amount: 40 },
      { fromId: eli, toId: cy, amount: 30 },
      { fromId: dee, toId: ana, amount: 10 },
      { fromId: eli, toId: ana, amount: 10 },
    ]);
  });

  // Chloé paid ¥1000 for Ana, then Ben paid ¥1000 for Ana: Ana −2000, Ben
  // +1000, Chloé +1000. Ben and Chloé tie, so Ben, created first, comes first,
  // whatever order the expenses were added in.
  it("break ties in favour of the earlier-created member, and are the same on every read", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Lunch",
      amount: "1000",
      date: "2026-11-14",
      payerId: chloe,
      participantIds: [ana],
    });
    await addExpense(db, linkToken, {
      description: "Taxi",
      amount: "1000",
      date: "2026-11-14",
      payerId: ben,
      participantIds: [ana],
    });

    const first = await readGroupView(db, linkToken);
    const second = await readGroupView(db, linkToken);

    expect(first?.suggestedSettlements).toEqual([
      { fromId: ana, toId: ben, amount: 1000 },
      { fromId: ana, toId: chloe, amount: 1000 },
    ]);
    expect(second?.suggestedSettlements).toEqual(first?.suggestedSettlements);
  });

  // Ana paid ¥3000 for all three; Ben pays Ana ¥1000, which leaves Chloé
  // owing Ana ¥1000; Chloé pays it, and everyone is settled up.
  it("follow every settlement recorded, and are none once everyone is settled up", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db, "JPY");
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "3000",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    const afterBen = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "1000",
      date: "2026-11-15",
    });
    const afterChloe = await addSettlement(db, linkToken, {
      fromId: chloe,
      toId: ana,
      amount: "1000",
      date: "2026-11-15",
    });

    expect(afterBen.ok && afterBen.view.suggestedSettlements).toEqual([
      { fromId: chloe, toId: ana, amount: 1000 },
    ]);
    expect(afterChloe.ok && afterChloe.view.suggestedSettlements).toEqual([]);
    expect(
      afterChloe.ok && afterChloe.view.members.map((m) => m.balance)
    ).toEqual([0, 0, 0]);
  });

  // The logic prototype's settlement larger than the balance, and loans. Ana paid 80.00 for Ana and
  // Ben: Ana +40.00, Ben −40.00.
  // Ben pays Ana 100.00, 60.00 too much: Ana −60.00, Ben +60.00, so Ana now
  //   pays Ben.
  // Cai lends Dee 50.00: Cai +50.00, Dee −50.00. Ana pays Ben 25.00 back:
  //   Ana −35.00, Ben +35.00. Dee owes most, so Dee pays Cai first.
  // Deleting the settlement larger than the balance: Ana +40.00 + 25.00 = +65.00, Ben −65.00.
  it("flip direction after a settlement larger than the balance, and flip back when it's deleted", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Flat",
      currency: "USD",
      memberNames: ["Ana", "Ben", "Cai", "Dee"],
    });
    if (!created.ok) throw new Error(created.reason);
    const { linkToken } = created.view;
    const [ana, ben, cai, dee] = created.view.members.map((m) => m.id);
    await addExpense(db, linkToken, {
      description: "Concert",
      amount: "80.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    const overpaid = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "100.00",
      date: "2026-11-15",
    });
    await addSettlement(db, linkToken, {
      fromId: cai,
      toId: dee,
      amount: "50.00",
      date: "2026-11-16",
    });
    const paidBack = await addSettlement(db, linkToken, {
      fromId: ana,
      toId: ben,
      amount: "25.00",
      date: "2026-11-17",
    });
    if (!overpaid.ok) throw new Error(overpaid.reason);
    const deleted = await deleteSettlement(db, linkToken, {
      settlementId: overpaid.view.settlements[0].id,
      version: 1,
    });

    expect(overpaid.view.suggestedSettlements).toEqual([
      { fromId: ana, toId: ben, amount: 6000 },
    ]);
    expect(paidBack.ok && paidBack.view.suggestedSettlements).toEqual([
      { fromId: dee, toId: cai, amount: 5000 },
      { fromId: ana, toId: ben, amount: 3500 },
    ]);
    expect(deleted.ok && deleted.view.members.map((m) => m.balance)).toEqual([
      6500, -6500, 5000, -5000,
    ]);
    expect(deleted.ok && deleted.view.suggestedSettlements).toEqual([
      { fromId: ben, toId: ana, amount: 6500 },
      { fromId: dee, toId: cai, amount: 5000 },
    ]);
  });
});
