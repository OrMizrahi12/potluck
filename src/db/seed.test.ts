import { describe, expect, it } from "vitest";
import {
  addExpense,
  addMember,
  createGroup,
  readGroupView,
  type GroupView,
} from "../group/service";
import { createTestDb } from "../test/db";
import type { Db } from "./types";
import { SEED_LINKS, seed } from "./seed";

/** A seeded group's view, read after seeding a fresh database. */
async function seededGroup(link: string): Promise<GroupView> {
  const db = await createTestDb();
  await seed(db);
  const view = await readGroupView(db, link);
  if (!view) throw new Error(`no seeded group at ${link}`);
  return view;
}

/**
 * A group view as its page shows it: members by name, since the ids of its
 * members, expenses and settlements are new on every run.
 */
function asShown(view: GroupView | undefined) {
  if (!view) return undefined;
  const names = new Map(view.members.map((m) => [m.id, m.name]));
  const name = (id: string) => names.get(id);
  const newEachRun = "(new each run)";
  return {
    ...view,
    members: view.members.map((m) => ({ ...m, id: newEachRun })),
    expenses: view.expenses.map((e) => ({
      ...e,
      id: newEachRun,
      payerId: name(e.payerId),
      shares: e.shares.map((s) => ({ ...s, memberId: name(s.memberId) })),
    })),
    settlements: view.settlements.map((s) => ({
      ...s,
      id: newEachRun,
      fromId: name(s.fromId),
      toId: name(s.toId),
    })),
    suggestedSettlements: view.suggestedSettlements.map((s) => ({
      ...s,
      fromId: name(s.fromId),
      toId: name(s.toId),
    })),
  };
}

/** What every seeded group's page shows. */
async function seededGroupsAsShown(db: Db) {
  return Promise.all(
    Object.values(SEED_LINKS).map(async (link) =>
      asShown(await readGroupView(db, link))
    )
  );
}

describe("the seed", () => {
  it("gives the same groups every time it runs, undoing changes made to them", async () => {
    const db = await createTestDb();
    await seed(db);
    const first = await seededGroupsAsShown(db);
    const flat = await readGroupView(db, SEED_LINKS.flatShare);
    if (!flat) throw new Error("no seeded flat share");
    const [ana, ben] = flat.members.map((m) => m.id);
    await addExpense(db, SEED_LINKS.flatShare, {
      description: "Pizza",
      amount: "20.00",
      date: "2026-10-30",
      payerId: ana,
      participantIds: [ana, ben],
    });

    await seed(db);

    expect(await seededGroupsAsShown(db)).toEqual(first);
    expect(first.every((group) => group !== undefined)).toBe(true);
  });

  it("gives a fresh database the same groups as one seeded before", async () => {
    const reseeded = await createTestDb();
    await seed(reseeded);
    await seed(reseeded);
    const fresh = await createTestDb();
    await seed(fresh);

    expect(await seededGroupsAsShown(reseeded)).toEqual(
      await seededGroupsAsShown(fresh)
    );
  });

  it("leaves groups it didn't create alone", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Lisbon trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    await seed(db);

    expect(await readGroupView(db, created.view.linkToken)).toEqual(
      created.view
    );
  });
});

/** Each member's name with their balance, in creation order. */
function balancesByName(view: GroupView) {
  return view.members.map((m) => [m.name, m.balance]);
}

describe("the seeded flat share", () => {
  // Rent 2,400.00 by Ana, electricity 88.00 by Ben and groceries 64.20 by Dee,
  // each among all four (600.00, 22.00 and 16.05 each); a 45.00 concert ticket
  // Ben bought for Dee alone. Ana +1,761.95, Ben −505.05, Cai −638.05,
  // Dee −618.85. Ben and Cai pay Ana what they owe; Dee moves out owing 618.85.
  it("has an inactive member who still owes the group", async () => {
    const view = await seededGroup(SEED_LINKS.flatShare);

    expect(view.members.map((m) => [m.name, m.active])).toEqual([
      ["Ana", true],
      ["Ben", true],
      ["Cai", true],
      ["Dee", false],
    ]);
    expect(balancesByName(view)).toEqual([
      ["Ana", 61885],
      ["Ben", 0],
      ["Cai", 0],
      ["Dee", -61885],
    ]);
  });

  // Ben bought Dee's 45.00 ticket: Ben is credited the whole amount and,
  // not being a participant, has no share of it.
  it("has an expense whose payer isn't a participant", async () => {
    const view = await seededGroup(SEED_LINKS.flatShare);
    const names = new Map(view.members.map((m) => [m.id, m.name]));

    const ticket = view.expenses.find(
      (e) => e.description === "Concert ticket for Dee"
    );
    expect(ticket && names.get(ticket.payerId)).toBe("Ben");
    expect(ticket?.shares.map((s) => [names.get(s.memberId), s.share])).toEqual(
      [["Dee", 4500]]
    );
  });
});

describe("the seeded ski cabin", () => {
  // The cabin, 1,200.00 by Eva among all four: Eva +900.00, the others −300.00.
  // Finn pays Eva 100.00, then 150.00: two partial settlements, still −50.00.
  // Gal pays Eva 400.00, 100.00 more than she owed: Gal +100.00.
  // Hana lends Finn 200.00, recorded from Hana to Finn: Hana −100.00, Finn −250.00.
  // So Eva +250.00, Finn −250.00, Gal +100.00, Hana −100.00.
  it("has settlements smaller and larger than the balance, and a loan", async () => {
    const view = await seededGroup(SEED_LINKS.skiCabin);
    const names = new Map(view.members.map((m) => [m.id, m.name]));
    const named = (s: { fromId: string; toId: string; amount: number }) => [
      names.get(s.fromId),
      names.get(s.toId),
      s.amount,
    ];

    expect(view.currency).toBe("USD");
    expect(view.settlements.map(named)).toEqual([
      ["Hana", "Finn", 20000],
      ["Gal", "Eva", 40000],
      ["Finn", "Eva", 15000],
      ["Finn", "Eva", 10000],
    ]);
    expect(balancesByName(view)).toEqual([
      ["Eva", 25000],
      ["Finn", -25000],
      ["Gal", 10000],
      ["Hana", -10000],
    ]);
    expect(view.suggestedSettlements.map(named)).toEqual([
      ["Finn", "Eva", 25000],
      ["Hana", "Gal", 10000],
    ]);
  });
});

describe("the seeded group in yen", () => {
  // Yen has no minor units. The hotel, ¥90,000 by Ana, and ramen, ¥3,600 by
  // Kenji, each among all three (¥30,000 and ¥1,200 each): Ana +58,800,
  // Kenji −27,600, Yui −31,200. Yui pays Ana ¥30,000: Ana +28,800, Yui −1,200.
  it("is in yen, with amounts in whole yen", async () => {
    const view = await seededGroup(SEED_LINKS.yenGroup);

    expect([view.currency, view.digits]).toEqual(["JPY", 0]);
    expect(view.expenses.map((e) => [e.description, e.amount])).toEqual([
      ["Ramen", 3600],
      ["Hotel", 90000],
    ]);
    expect(balancesByName(view)).toEqual([
      ["Ana", 28800],
      ["Kenji", -27600],
      ["Yui", -1200],
    ]);
  });
});

describe("the seeded group in dinars", () => {
  // The Bahraini dinar has three decimals. A taxi, 10.500 by Ali among all
  // three (3.500 each): Ali +7.000. Lunch, 4.250 by Sara for Sara and Omar
  // (2.125 each): Sara −3.500 + 2.125 = −1.375, Omar −3.500 − 2.125 = −5.625.
  it("is in Bahraini dinars, with amounts in thousandths", async () => {
    const view = await seededGroup(SEED_LINKS.dinarGroup);

    expect([view.currency, view.digits]).toEqual(["BHD", 3]);
    expect(view.expenses.map((e) => [e.description, e.amount])).toEqual([
      ["Lunch", 4250],
      ["Taxi", 10500],
    ]);
    expect(balancesByName(view)).toEqual([
      ["Ali", 7000],
      ["Sara", -1375],
      ["Omar", -5625],
    ]);
  });
});

describe("the seeded reunion", () => {
  // Hall hire, 500.00 by Guest 1 among all 50 (10.00 each): Guest 1 +490.00,
  // every other guest −10.00.
  it("has 50 members, the most a group can have", async () => {
    const db = await createTestDb();
    await seed(db);

    const view = await readGroupView(db, SEED_LINKS.fullGroup);

    expect(view?.members.map((m) => [m.name, m.balance])).toEqual([
      ["Guest 1", 49000],
      ...Array.from({ length: 49 }, (_, i) => [`Guest ${i + 2}`, -1000]),
    ]);
    expect(
      await addMember(db, SEED_LINKS.fullGroup, { name: "Guest 51" })
    ).toEqual({ ok: false, reason: "too-many-members" });
  });
});
