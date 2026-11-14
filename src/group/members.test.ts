import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import { addMember, createGroup, readGroupView } from "./service";

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
