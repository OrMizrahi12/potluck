import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { members } from "../db/schema";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import {
  addExpense,
  addMember,
  addSettlement,
  createGroup,
  deleteMember,
  readGroupView,
  renameMember,
  setMemberActive,
} from "./service";

/** A fresh group with members Ana, Ben and Chloé. */
async function lisbonGroup(db: Db) {
  const created = await createGroup(db, {
    name: "Lisbon trip",
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  if (!created.ok) throw new Error(created.reason);
  const [ana, ben, chloe] = created.view.members.map((m) => m.id);
  return { linkToken: created.view.linkToken, ana, ben, chloe };
}

describe("add member", () => {
  it("adds an active member after the others, trimmed", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    const result = await addMember(db, linkToken, { name: "  Dan " });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => [m.name, m.active])).toEqual([
      ["Ana", true],
      ["Ben", true],
      ["Chloé", true],
      ["Dan", true],
    ]);
  });
});

describe("add member refusals", () => {
  it.each([
    ["same spelling", "Ben"],
    ["different case", "BEN"],
    ["surrounding spaces", "  ben "],
  ])("refuses a name another member has: %s", async (_, name) => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    expect(await addMember(db, linkToken, { name })).toEqual({
      ok: false,
      reason: "member-name-duplicate",
    });
    expect((await readGroupView(db, linkToken))?.members).toHaveLength(3);
  });

  it.each([
    ["a blank name", "   ", "member-name-missing"],
    ["a 51-character name", "a".repeat(51), "member-name-too-long"],
  ])("refuses %s", async (_, name, reason) => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);

    expect(await addMember(db, linkToken, { name })).toEqual({
      ok: false,
      reason,
    });
  });

  it("refuses an unknown link", async () => {
    const db = await createTestDb();

    expect(
      await addMember(db, "AAAAAAAAAAAAAAAAAAAAAA", { name: "Dan" })
    ).toEqual({ ok: false, reason: "group-unknown" });
  });

  it("caps a group at 50 members", async () => {
    const db = await createTestDb();
    const { linkToken } = await lisbonGroup(db);
    for (let i = 4; i <= 50; i++) {
      const added = await addMember(db, linkToken, { name: `Member ${i}` });
      if (!added.ok) throw new Error(added.reason);
    }

    expect(await addMember(db, linkToken, { name: "Member 51" })).toEqual({
      ok: false,
      reason: "too-many-members",
    });
    expect((await readGroupView(db, linkToken))?.members).toHaveLength(50);
  });
});

describe("rename member", () => {
  it("renames the member and moves their version on", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);

    const result = await renameMember(db, linkToken, {
      memberId: ben,
      version: 1,
      name: " Benjamin ",
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members[1]).toMatchObject({
      id: ben,
      name: "Benjamin",
      version: 2,
    });
  });

  it("lets a member's own name change case", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);

    const result = await renameMember(db, linkToken, {
      memberId: ben,
      version: 1,
      name: "BEN",
    });

    expect(result.ok && result.view.members[1].name).toBe("BEN");
  });
});

describe("rename member refusals", () => {
  it.each([
    ["another member's name", "chloé ", "member-name-duplicate"],
    ["a blank name", " ", "member-name-missing"],
    ["a 51-character name", "a".repeat(51), "member-name-too-long"],
  ])("refuses %s", async (_, name, reason) => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);

    expect(
      await renameMember(db, linkToken, { memberId: ben, version: 1, name })
    ).toEqual({ ok: false, reason });
    expect((await readGroupView(db, linkToken))?.members[1].name).toBe("Ben");
  });

  it("refuses a stale version: this changed, reload", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);
    await renameMember(db, linkToken, {
      memberId: ben,
      version: 1,
      name: "Bo",
    });

    expect(
      await renameMember(db, linkToken, {
        memberId: ben,
        version: 1,
        name: "Benny",
      })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect((await readGroupView(db, linkToken))?.members[1].name).toBe("Bo");
  });

  it("refuses a member of another group and an unknown link", async () => {
    const db = await createTestDb();
    const lisbon = await lisbonGroup(db);
    const other = await lisbonGroup(db);

    expect(
      await renameMember(db, lisbon.linkToken, {
        memberId: other.ben,
        version: 1,
        name: "Bo",
      })
    ).toEqual({ ok: false, reason: "member-unknown" });
    expect(
      await renameMember(db, "AAAAAAAAAAAAAAAAAAAAAA", {
        memberId: lisbon.ben,
        version: 1,
        name: "Bo",
      })
    ).toEqual({ ok: false, reason: "group-unknown" });
  });
});

describe("inactive member", () => {
  it("can be made inactive and active again, moving their version on each time", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);

    const inactive = await setMemberActive(db, linkToken, {
      memberId: ben,
      version: 1,
      active: false,
    });
    if (!inactive.ok) throw new Error(`refused: ${inactive.reason}`);
    expect(inactive.view.members[1]).toMatchObject({
      active: false,
      version: 2,
    });

    const active = await setMemberActive(db, linkToken, {
      memberId: ben,
      version: 2,
      active: true,
    });
    if (!active.ok) throw new Error(`refused: ${active.reason}`);
    expect(active.view.members[1]).toMatchObject({ active: true, version: 3 });
  });

  // Ana paid 30.00 for all three: Ana +20.00, Ben −10.00, Chloé −10.00.
  // Ben leaves owing 10.00; he still pays Ana in the suggested settlements.
  it("keeps their balance and stays in the suggested settlements", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ana, ben, chloe],
    });

    const result = await setMemberActive(db, linkToken, {
      memberId: ben,
      version: 1,
      active: false,
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => [m.name, m.balance])).toEqual([
      ["Ana", 2000],
      ["Ben", -1000],
      ["Chloé", -1000],
    ]);
    expect(result.view.suggestedSettlements).toEqual([
      { fromId: ben, toId: ana, amount: 1000 },
      { fromId: chloe, toId: ana, amount: 1000 },
    ]);
  });

  // Ben, inactive, pays 9.00 for Ana and himself: Ben +4.50, Ana −4.50.
  // Then he records paying Ana 1.00: Ben +5.50, Ana −5.50.
  it("can still pay, take part in an expense and record a settlement", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    await setMemberActive(db, linkToken, {
      memberId: ben,
      version: 1,
      active: false,
    });

    const expense = await addExpense(db, linkToken, {
      description: "Late receipt",
      amount: "9.00",
      date: "2026-11-14",
      payerId: ben,
      participantIds: [ana, ben],
    });
    const settlement = await addSettlement(db, linkToken, {
      fromId: ben,
      toId: ana,
      amount: "1.00",
      date: "2026-11-15",
    });

    expect(expense.ok).toBe(true);
    if (!settlement.ok) throw new Error(`refused: ${settlement.reason}`);
    expect(settlement.view.members.map((m) => m.balance)).toEqual([
      -550, 550, 0,
    ]);
  });

  it("refuses a stale version", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);
    await renameMember(db, linkToken, {
      memberId: ben,
      version: 1,
      name: "Bo",
    });

    expect(
      await setMemberActive(db, linkToken, {
        memberId: ben,
        version: 1,
        active: false,
      })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect((await readGroupView(db, linkToken))?.members[1].active).toBe(true);
  });
});

describe("delete member", () => {
  it("deletes a member no expense or settlement references", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);

    const result = await deleteMember(db, linkToken, {
      memberId: ben,
      version: 1,
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => m.name)).toEqual(["Ana", "Chloé"]);
  });

  it("shows which members are referenced, so the page knows whom it can delete", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben } = await lisbonGroup(db);
    await addMember(db, linkToken, { name: "Dan" });

    // Ana pays for Ben; Chloé and Dan appear nowhere yet.
    const result = await addExpense(db, linkToken, {
      description: "Taxi",
      amount: "10.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ben],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => [m.name, m.referenced])).toEqual([
      ["Ana", true],
      ["Ben", true],
      ["Chloé", false],
      ["Dan", false],
    ]);
  });

  it("puts a member added after a deletion last", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);
    await deleteMember(db, linkToken, { memberId: ben, version: 1 });

    const result = await addMember(db, linkToken, { name: "Ben" });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view.members.map((m) => m.name)).toEqual([
      "Ana",
      "Chloé",
      "Ben",
    ]);
  });
});

describe("delete member refusals", () => {
  it.each([
    ["the payer of an expense", "payer"],
    ["a participant in an expense", "participant"],
    ["the member who paid in a settlement", "from"],
    ["the member who was paid in a settlement", "to"],
  ] as const)("refuses to delete %s", async (_, role) => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    // Ben is referenced only in the given role.
    if (role === "payer" || role === "participant") {
      await addExpense(db, linkToken, {
        description: "Dinner",
        amount: "30.00",
        date: "2026-11-14",
        payerId: role === "payer" ? ben : ana,
        participantIds: role === "payer" ? [ana, chloe] : [ana, ben],
      });
    } else {
      await addSettlement(db, linkToken, {
        fromId: role === "from" ? ben : ana,
        toId: role === "from" ? ana : ben,
        amount: "5.00",
        date: "2026-11-14",
      });
    }

    expect(
      await deleteMember(db, linkToken, { memberId: ben, version: 1 })
    ).toEqual({ ok: false, reason: "member-referenced" });
    expect(
      (await readGroupView(db, linkToken))?.members.map((m) => m.name)
    ).toEqual(["Ana", "Ben", "Chloé"]);
  });

  it("is backed by the database, whose foreign keys block deleting a referenced member", async () => {
    const db = await createTestDb();
    const { linkToken, ana, ben, chloe } = await lisbonGroup(db);
    await addExpense(db, linkToken, {
      description: "Dinner",
      amount: "30.00",
      date: "2026-11-14",
      payerId: ana,
      participantIds: [ben],
    });
    await addSettlement(db, linkToken, {
      fromId: chloe,
      toId: ana,
      amount: "5.00",
      date: "2026-11-14",
    });

    for (const id of [ana, ben, chloe]) {
      await expect(
        db.delete(members).where(eq(members.id, id))
      ).rejects.toThrow();
    }
  });

  it("refuses a stale version", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);
    await renameMember(db, linkToken, {
      memberId: ben,
      version: 1,
      name: "Bo",
    });

    expect(
      await deleteMember(db, linkToken, { memberId: ben, version: 1 })
    ).toEqual({ ok: false, reason: "stale-version" });
    expect((await readGroupView(db, linkToken))?.members).toHaveLength(3);
  });

  it("refuses a member already deleted, or not a member at all", async () => {
    const db = await createTestDb();
    const { linkToken, ben } = await lisbonGroup(db);
    await deleteMember(db, linkToken, { memberId: ben, version: 1 });

    expect(
      await deleteMember(db, linkToken, { memberId: ben, version: 1 })
    ).toEqual({ ok: false, reason: "member-unknown" });
    expect(
      await deleteMember(db, linkToken, { memberId: "not-an-id", version: 1 })
    ).toEqual({ ok: false, reason: "member-unknown" });
  });
});
