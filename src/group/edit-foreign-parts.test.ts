import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addSettlement,
  changeCurrency,
  createGroup,
  editExpense,
  editSettlement,
  readGroupView,
} from "./service";

/** A fresh EUR group with members Ana, Ben, Cai and Dee. */
async function zermattGroup(db: Db) {
  const created = await createGroup(db, {
    name: "Zermatt trip",
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Cai", "Dee"],
  });
  if (!created.ok) throw new Error(created.reason);
  const [ana, ben, cai, dee] = created.view.members.map((m) => m.id);
  return { linkToken: created.view.linkToken, ana, ben, cai, dee };
}

/** Ana's CHF 48.00 fondue for Ana and Ben at 1.0463: 50.2224 EUR, sent as €50.22. */
async function fondue(db: Db) {
  const g = await zermattGroup(db);
  const added = await addExpense(db, g.linkToken, {
    description: "Fondue",
    amount: "50.22",
    date: "2026-11-14",
    payerId: g.ana,
    participantIds: [g.ana, g.ben],
    foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
  });
  if (!added.ok) throw new Error(`refused: ${added.reason}`);
  return { ...g, expenseId: added.view.expenses[0].id };
}

/** Cai hands Ana $689.09 at 0.925926: 638.04664... EUR, sent as €638.05. */
async function cashToAna(db: Db) {
  const g = await zermattGroup(db);
  const added = await addSettlement(db, g.linkToken, {
    fromId: g.cai,
    toId: g.ana,
    amount: "638.05",
    date: "2026-11-14",
    foreign: { amount: "689.09", currency: "USD", rate: "0.925926" },
  });
  if (!added.ok) throw new Error(`refused: ${added.reason}`);
  return { ...g, settlementId: added.view.settlements[0].id };
}

describe("editing an expense with a foreign amount", () => {
  it("keeps the foreign part when an edit sends it again", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai, expenseId } = await fondue(db);

    const result = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      description: "Fondue at the hut",
      amount: "50.22",
      date: "2026-11-14",
      payerId: ben,
      participantIds: [ana, ben, cai],
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0]).toMatchObject({
      description: "Fondue at the hut",
      amount: 5022,
      payerId: ben,
      version: 2,
      foreign: { amount: 4800, currency: "CHF", digits: 2, rate: "1.0463" },
    });
  });

  // CHF 52.00 × 1.0470 = 54.444 EUR, sent as €54.44.
  it("replaces the foreign part with the one an edit sends", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, expenseId } = await fondue(db);

    const result = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      description: "Fondue",
      amount: "54.44",
      date: "2026-11-13",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "52.00", currency: "CHF", rate: "1.0470" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0]).toMatchObject({
      amount: 5444,
      date: "2026-11-13",
      foreign: { amount: 5200, currency: "CHF", digits: 2, rate: "1.0470" },
    });
    const read = await readGroupView(db, linkToken);
    expect(read?.expenses[0].foreign).toEqual({
      amount: 5200,
      currency: "CHF",
      digits: 2,
      rate: "1.0470",
    });
  });

  it("clears the foreign part when an edit sends none, leaving a plain amount", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, expenseId } = await fondue(db);

    const result = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      description: "Fondue",
      amount: "50.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0].amount).toBe(5000);
    expect(result.view.expenses[0]).not.toHaveProperty("foreign");
    const read = await readGroupView(db, linkToken);
    expect(read?.expenses[0]).not.toHaveProperty("foreign");
  });

  // CHF 48.00 × 1.0463 = 50.2224 EUR, sent as €50.22.
  it("adds a foreign part to an expense first recorded in the group currency", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await zermattGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Fondue",
      amount: "48.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    });
    if (!added.ok) throw new Error(`refused: ${added.reason}`);

    const result = await editExpense(db, linkToken, {
      expenseId: added.view.expenses[0].id,
      version: 1,
      description: "Fondue",
      amount: "50.22",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.expenses[0]).toMatchObject({
      amount: 5022,
      foreign: { amount: 4800, currency: "CHF", digits: 2, rate: "1.0463" },
    });
  });

  // ¥2 × 0.0062 = 0.0124 EUR, sent as €0.01: fine for one participant, but
  // an edit keeping the frozen rate and adding three more can't split one cent
  // among four.
  it("refuses a converted figure too small to split on an edit that keeps the frozen rate", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai, dee } = await zermattGroup(db);
    const added = await addExpense(db, linkToken, {
      description: "Gum",
      amount: "0.01",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ben],
      foreign: { amount: "2", currency: "JPY", rate: "0.0062" },
    });
    if (!added.ok) throw new Error(`refused: ${added.reason}`);

    const result = await editExpense(db, linkToken, {
      expenseId: added.view.expenses[0].id,
      version: 1,
      description: "Gum",
      amount: "0.01",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, cai, dee],
      foreign: { amount: "2", currency: "JPY", rate: "0.0062" },
    });

    expect(result).toEqual({ ok: false, reason: "amount-too-small-to-split" });
  });

  // CHF 9,600,000.00 × 1.0463 = 10,044,480 EUR: over the cap of 10,000,000.
  it("refuses a converted figure over the cap on an edit that keeps the frozen rate", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, expenseId } = await fondue(db);

    const result = await editExpense(db, linkToken, {
      expenseId,
      version: 1,
      description: "Fondue",
      amount: "10044480.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
      foreign: { amount: "9600000.00", currency: "CHF", rate: "1.0463" },
    });

    expect(result).toEqual({ ok: false, reason: "amount-too-large" });
  });

  it("refuses an edit made from a version someone else has since changed, and keeps the foreign part", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, expenseId } = await fondue(db);
    const edit = {
      expenseId,
      version: 1,
      description: "Fondue",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben],
    };
    const first = await editExpense(db, linkToken, {
      ...edit,
      description: "Fondue at the hut",
      amount: "50.22",
      foreign: { amount: "48.00", currency: "CHF", rate: "1.0463" },
    });
    if (!first.ok) throw new Error(`refused: ${first.reason}`);

    const second = await editExpense(db, linkToken, {
      ...edit,
      amount: "50.00",
    });

    expect(second).toEqual({ ok: false, reason: "stale-version" });
    const read = await readGroupView(db, linkToken);
    expect(read?.expenses[0]).toMatchObject({
      description: "Fondue at the hut",
      amount: 5022,
      foreign: { amount: 4800, currency: "CHF", digits: 2, rate: "1.0463" },
    });
  });

  it("leaves the group currency locked", async () => {
    const db = await createTestDb();
    const { linkToken } = await fondue(db);

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "CHF" })
    ).toEqual({ ok: false, reason: "group-has-entries" });
  });
});

describe("editing a settlement with a foreign amount", () => {
  it("keeps the foreign part when an edit sends it again", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, settlementId } = await cashToAna(db);

    const result = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      fromId: ben,
      toId: ana,
      amount: "638.05",
      date: "2026-11-14",
      foreign: { amount: "689.09", currency: "USD", rate: "0.925926" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0]).toMatchObject({
      fromId: ben,
      amount: 63805,
      version: 2,
      foreign: { amount: 68909, currency: "USD", digits: 2, rate: "0.925926" },
    });
  });

  // $689.09 × 0.93 = 640.8537 EUR, sent as €640.85.
  it("replaces the foreign part with the one an edit sends", async () => {
    const db = await createTestDb();
    const { linkToken, ana, cai, settlementId } = await cashToAna(db);

    const result = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      fromId: cai,
      toId: ana,
      amount: "640.85",
      date: "2026-11-13",
      foreign: { amount: "689.09", currency: "USD", rate: "0.93" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0]).toMatchObject({
      amount: 64085,
      date: "2026-11-13",
      foreign: { amount: 68909, currency: "USD", digits: 2, rate: "0.93" },
    });
  });

  it("clears the foreign part when an edit sends none, leaving a plain amount", async () => {
    const db = await createTestDb();
    const { linkToken, ana, cai, settlementId } = await cashToAna(db);

    const result = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      fromId: cai,
      toId: ana,
      amount: "640.00",
      date: "2026-11-14",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0].amount).toBe(64000);
    expect(result.view.settlements[0]).not.toHaveProperty("foreign");
    const read = await readGroupView(db, linkToken);
    expect(read?.settlements[0]).not.toHaveProperty("foreign");
  });

  // CHF 28.00 × 1.0463 = 29.2964 EUR, sent as €29.30.
  it("adds a foreign part to a settlement first recorded in the group currency", async () => {
    const db = await createTestDb();
    const { linkToken, ana, cai } = await zermattGroup(db);
    const added = await addSettlement(db, linkToken, {
      fromId: cai,
      toId: ana,
      amount: "28.00",
      date: "2026-11-14",
    });
    if (!added.ok) throw new Error(`refused: ${added.reason}`);

    const result = await editSettlement(db, linkToken, {
      settlementId: added.view.settlements[0].id,
      version: 1,
      fromId: cai,
      toId: ana,
      amount: "29.30",
      date: "2026-11-14",
      foreign: { amount: "28.00", currency: "CHF", rate: "1.0463" },
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.settlements[0]).toMatchObject({
      amount: 2930,
      foreign: { amount: 2800, currency: "CHF", digits: 2, rate: "1.0463" },
    });
  });

  // ¥1000 × 0.0042 = €4.20. Correcting the yen to ¥1 at the same frozen
  // rate gives 0.0042 EUR, which rounds half up to €0.00.
  it("refuses a foreign amount that converts to zero on an edit that keeps the frozen rate", async () => {
    const db = await createTestDb();
    const { linkToken, ana, cai } = await zermattGroup(db);
    const added = await addSettlement(db, linkToken, {
      fromId: cai,
      toId: ana,
      amount: "4.20",
      date: "2026-11-14",
      foreign: { amount: "1000", currency: "JPY", rate: "0.0042" },
    });
    if (!added.ok) throw new Error(`refused: ${added.reason}`);

    const result = await editSettlement(db, linkToken, {
      settlementId: added.view.settlements[0].id,
      version: 1,
      fromId: cai,
      toId: ana,
      amount: "0.00",
      date: "2026-11-14",
      foreign: { amount: "1", currency: "JPY", rate: "0.0042" },
    });

    expect(result).toEqual({
      ok: false,
      reason: "foreign-amount-converts-to-zero",
    });
  });

  it("refuses an edit made from a version someone else has since changed, and keeps the foreign part", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, cai, settlementId } = await cashToAna(db);
    const first = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      fromId: ben,
      toId: ana,
      amount: "638.05",
      date: "2026-11-14",
      foreign: { amount: "689.09", currency: "USD", rate: "0.925926" },
    });
    if (!first.ok) throw new Error(`refused: ${first.reason}`);

    const second = await editSettlement(db, linkToken, {
      settlementId,
      version: 1,
      fromId: cai,
      toId: ana,
      amount: "640.00",
      date: "2026-11-14",
    });

    expect(second).toEqual({ ok: false, reason: "stale-version" });
    const read = await readGroupView(db, linkToken);
    expect(read?.settlements[0]).toMatchObject({
      fromId: ben,
      amount: 63805,
      foreign: { amount: 68909, currency: "USD", digits: 2, rate: "0.925926" },
    });
  });

  it("leaves the group currency locked", async () => {
    const db = await createTestDb();
    const { linkToken } = await cashToAna(db);

    expect(
      await changeCurrency(db, linkToken, { version: 1, currency: "USD" })
    ).toEqual({ ok: false, reason: "group-has-entries" });
  });
});
