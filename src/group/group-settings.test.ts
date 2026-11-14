import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  changeCurrency,
  createGroup,
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

describe("change currency", () => {
  it("changes the currency of an empty group and moves its version on", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    const result = await changeCurrency(db, linkToken, {
      version: 1,
      currency: "BHD",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view).toMatchObject({
      currency: "BHD",
      digits: 3,
      version: 2,
    });
  });
});

describe("change currency refusals", () => {
  it("refuses once the group has an expense", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "10.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "JPY" })
    ).toEqual({ ok: false, reason: "group-has-entries" });
    expect((await readGroupView(db, linkToken))?.currency).toBe("EUR");
  });

  it("refuses once the group has a settlement", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    await addSettlement(db, linkToken, {
      fromId: ana,
      toId: ben,
      amount: "10.00",
      date: "2026-11-14",
    });

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "JPY" })
    ).toEqual({ ok: false, reason: "group-has-entries" });
    expect((await readGroupView(db, linkToken))?.currency).toBe("EUR");
  });

  it("refuses a currency outside the table", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "XXX" })
    ).toEqual({ ok: false, reason: "currency-unknown" });
  });

  it("refuses a stale version", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);
    await changeCurrency(db, linkToken, { version: 1, currency: "USD" });

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "JPY" })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect((await readGroupView(db, linkToken))?.currency).toBe("USD");
  });

  it("refuses an unknown link", async () => {
    const db = await createTestDb();

    expect(
      await changeCurrency(db, "AAAAAAAAAAAAAAAAAAAAAA", {
        version: 1,
        currency: "JPY",
      })
    ).toEqual({ ok: false, reason: "group-unknown" });
  });
});
