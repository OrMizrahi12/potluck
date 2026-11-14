import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  createGroup,
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

type Ids = { ana: string; ben: string; chloe: string };

describe("edit settlement", () => {
  // Ana paid 30.00 for all three: Ana +20.00, Ben −10.00, Chloé −10.00.
  // Ben paid Ana 10.00 on the 15th, corrected to Chloé paying Ana 4.00 on
  // the 16th: Ana +16.00, Ben −10.00, Chloé −6.00.
  it("changes from, to, amount and date, and the balances follow", async () => {
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
    const { id } = added.view.settlements[0];

    const result = await editSettlement(db, linkToken, {
      settlementId: id,
      version: 1,
      fromId: chloe,
      toId: ana,
      amount: "4.00",
      date: "2026-11-16",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements).toEqual([
      {
        id,
        fromId: chloe,
        toId: ana,
        amount: 400,
        date: "2026-11-16",
        version: 2,
      },
    ]);
    expect(result.view.members.map((m) => m.balance)).toEqual([
      1600, -1000, -600,
    ]);
    expect(result.view.suggestedSettlements).toEqual([
      { fromId: ben, toId: ana, amount: 1000 },
      { fromId: chloe, toId: ana, amount: 600 },
    ]);
  });

  it.each<[string, (ids: Ids) => object, (ids: Ids) => object]>([
    [
      "from",
      ({ chloe }) => ({ fromId: chloe }),
      ({ chloe }) => ({ fromId: chloe }),
    ],
    ["to", ({ chloe }) => ({ toId: chloe }), ({ chloe }) => ({ toId: chloe })],
    ["amount", () => ({ amount: "2.50" }), () => ({ amount: 250 })],
    ["date", () => ({ date: "2026-10-31" }), () => ({ date: "2026-10-31" })],
  ])(
    "changes only the %s when only it is edited",
    async (_field, change, expected) => {
      const db = await createTestDb();
      const ids = await lisbonGroup(db);
      const { linkToken, ana, ben } = ids;
      const input = {
        fromId: ben,
        toId: ana,
        amount: "10.00",
        date: "2026-11-15",
      };
      const added = await addSettlement(db, linkToken, input);
      if (!added.ok) throw new Error(added.reason);
      const before = added.view.settlements[0];

      const result = await editSettlement(db, linkToken, {
        settlementId: before.id,
        version: 1,
        ...input,
        ...change(ids),
      });

      if (!result.ok) throw new Error(`refused: ${result.reason}`);
      expect(result.view.settlements[0]).toEqual({
        ...before,
        version: 2,
        ...expected(ids),
      });
    }
  );
});

describe("edit settlement refusals", () => {
  /** Edits Ben's 10.00 EUR settlement to Ana, and reads the group back after. */
  async function refusal(change: (ids: Ids) => object) {
    const db = await createTestDb();
    const ids = await lisbonGroup(db);
    const { linkToken, ana, ben } = ids;
    const input = {
      fromId: ben,
      toId: ana,
      amount: "10.00",
      date: "2026-11-15",
    };
    const added = await addSettlement(db, linkToken, input);
    if (!added.ok) throw new Error(added.reason);
    const result = await editSettlement(db, linkToken, {
      settlementId: added.view.settlements[0].id,
      version: 1,
      ...input,
      ...change(ids),
    });
    const after = await readGroupView(db, linkToken);
    return { result, before: added.view, after };
  }

  it.each<[string, (ids: Ids) => object]>([
    ["amount-unreadable", () => ({ amount: "1,000" })],
    ["amount-not-positive", () => ({ amount: "-10" })],
    ["amount-too-large", () => ({ amount: "10000000.01" })],
    ["date-unreadable", () => ({ date: "2026-11-31" })],
    ["from-unknown", () => ({ fromId: "not-a-member" })],
    ["to-unknown", () => ({ toId: "not-a-member" })],
    ["settlement-to-self", ({ ana }) => ({ fromId: ana, toId: ana })],
  ])("refuses with %s and changes nothing", async (reason, change) => {
    const { result, before, after } = await refusal(change);

    expect(result).toEqual({ ok: false, reason });
    expect(after).toEqual(before);
  });

  it("refuses an edit made from a version someone else has since changed, and changes nothing", async () => {
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
    // Ana and Ben both open version 1; Ana saves first.
    const anas = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      ...input,
      amount: "12.00",
    });
    if (!anas.ok) throw new Error(anas.reason);

    const bens = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      ...input,
      date: "2026-11-14",
    });

    expect(bens).toEqual({ ok: false, reason: "stale-version" });
    expect(await readGroupView(db, linkToken)).toEqual(anas.view);
  });

  it("refuses a settlement id the group doesn't have", async () => {
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
        await editSettlement(db, lisbon.linkToken, {
          settlementId,
          version: 1,
          fromId: lisbon.ben,
          toId: lisbon.ana,
          amount: "10.00",
          date: "2026-11-15",
        })
      ).toEqual({ ok: false, reason: "settlement-unknown" });
    }
    expect(await readGroupView(db, other.linkToken)).toEqual(added.view);
  });
});
