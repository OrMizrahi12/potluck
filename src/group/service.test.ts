import { describe, expect, it } from "vitest";
import { createTestDb } from "../test/db";
import { createGroup, readGroupView } from "./service";

describe("create group", () => {
  it("returns a group view that the link opens again", async () => {
    const db = await createTestDb();

    const result = await createGroup(db, {
      name: "Lisbon trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben", "Chloé"],
    });

    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.view).toMatchObject({
      name: "Lisbon trip",
      currency: "EUR",
      digits: 2,
      version: 1,
      members: [
        { name: "Ana", active: true, version: 1 },
        { name: "Ben", active: true, version: 1 },
        { name: "Chloé", active: true, version: 1 },
      ],
    });
    expect(await readGroupView(db, result.view.linkToken)).toEqual(result.view);
  });
});

const lisbonGroup = {
  name: "Lisbon trip",
  currency: "EUR",
  memberNames: ["Ana", "Ben"],
};

describe("create group refusals", () => {
  it.each([
    ["same spelling", ["Ana", "Ana"]],
    ["different case", ["Ana", "ANA"]],
    ["surrounding spaces", ["Ana", "  ana "]],
    ["different Unicode composition", ["Chloé", "Chloé"]],
    ["Turkish dotted capital I", ["İvo", "ivo"]],
  ])("refuses duplicate member names: %s", async (_, memberNames) => {
    const db = await createTestDb();

    expect(await createGroup(db, { ...lisbonGroup, memberNames })).toEqual({
      ok: false,
      reason: "member-name-duplicate",
    });
  });

  it("refuses a group with no members", async () => {
    const db = await createTestDb();

    expect(await createGroup(db, { ...lisbonGroup, memberNames: [] })).toEqual({
      ok: false,
      reason: "members-missing",
    });
  });

  it("refuses a blank member name", async () => {
    const db = await createTestDb();

    expect(
      await createGroup(db, { ...lisbonGroup, memberNames: ["Ana", "   "] })
    ).toEqual({
      ok: false,
      reason: "member-name-missing",
    });
  });

  it("refuses a blank group name", async () => {
    const db = await createTestDb();

    expect(await createGroup(db, { ...lisbonGroup, name: "  " })).toEqual({
      ok: false,
      reason: "group-name-missing",
    });
  });

  it("caps group names at 100 characters and member names at 50", async () => {
    const db = await createTestDb();

    expect(
      (await createGroup(db, { ...lisbonGroup, name: "x".repeat(100) })).ok
    ).toBe(true);
    expect(
      await createGroup(db, { ...lisbonGroup, name: "x".repeat(101) })
    ).toEqual({
      ok: false,
      reason: "group-name-too-long",
    });
    expect(
      (await createGroup(db, { ...lisbonGroup, memberNames: ["y".repeat(50)] }))
        .ok
    ).toBe(true);
    expect(
      await createGroup(db, { ...lisbonGroup, memberNames: ["y".repeat(51)] })
    ).toEqual({
      ok: false,
      reason: "member-name-too-long",
    });
  });

  it("caps a group at 50 members", async () => {
    const db = await createTestDb();
    const names = (n: number) =>
      Array.from({ length: n }, (_, i) => `Member ${i + 1}`);

    const fifty = await createGroup(db, {
      ...lisbonGroup,
      memberNames: names(50),
    });
    expect(fifty.ok && fifty.view.members).toHaveLength(50);
    expect(
      await createGroup(db, { ...lisbonGroup, memberNames: names(51) })
    ).toEqual({
      ok: false,
      reason: "too-many-members",
    });
  });

  it("refuses a currency outside ISO 4217", async () => {
    const db = await createTestDb();

    for (const currency of ["eur", "ZZZ", "EURO", ""]) {
      expect(
        await createGroup(db, { ...lisbonGroup, currency }),
        currency
      ).toEqual({
        ok: false,
        reason: "currency-unknown",
      });
    }
  });

  it("refuses the 13 currencies whose minor unit is N.A.", async () => {
    const db = await createTestDb();
    const na = [
      "XAG",
      "XAU",
      "XBA",
      "XBB",
      "XBC",
      "XBD",
      "XDR",
      "XPD",
      "XPT",
      "XSU",
      "XTS",
      "XUA",
      "XXX",
    ];

    for (const currency of na) {
      expect(
        await createGroup(db, { ...lisbonGroup, currency }),
        currency
      ).toEqual({
        ok: false,
        reason: "currency-unknown",
      });
    }
  });
});

describe("the group view", () => {
  it("gives each currency its ISO 4217 minor unit, not the browser's", async () => {
    const db = await createTestDb();
    // From ISO 4217 List One. Browsers' CLDR data gives HUF and IQD 0.
    const expected = { JPY: 0, EUR: 2, HUF: 2, IQD: 3, BHD: 3, CLF: 4 };

    for (const [currency, minorUnit] of Object.entries(expected)) {
      const result = await createGroup(db, { ...lisbonGroup, currency });
      expect(result.ok && result.view.digits, currency).toBe(minorUnit);
    }
  });

  it("shows names without their surrounding spaces", async () => {
    const db = await createTestDb();

    const result = await createGroup(db, {
      ...lisbonGroup,
      name: "  Flat 4B ",
      memberNames: [" Ana", "Ben  "],
    });

    expect(result.ok && result.view).toMatchObject({
      name: "Flat 4B",
      members: [{ name: "Ana" }, { name: "Ben" }],
    });
  });

  it("keeps members in the order they were given", async () => {
    const db = await createTestDb();
    const memberNames = [
      "Zoe",
      "Ana",
      "Mo",
      "Ben",
      "Kai",
      "Lea",
      "Ivo",
      "Dee",
      "Ugo",
      "Fay",
      "Oz",
    ];

    const result = await createGroup(db, { ...lisbonGroup, memberNames });
    if (!result.ok) throw new Error(result.reason);

    expect(
      (await readGroupView(db, result.view.linkToken))?.members.map(
        (m) => m.name
      )
    ).toEqual(memberNames);
  });
});

describe("the group link", () => {
  it("carries at least 128 random bits, different for every group", async () => {
    const db = await createTestDb();

    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = await createGroup(db, lisbonGroup);
      if (!result.ok) throw new Error(result.reason);
      expect(result.view.linkToken).toMatch(/^[A-Za-z0-9_-]{22,}$/); // 22 base64url characters hold 128 bits
      tokens.add(result.view.linkToken);
    }

    expect(tokens.size).toBe(20);
  });

  it("opens nothing when no group has that token", async () => {
    const db = await createTestDb();
    const result = await createGroup(db, lisbonGroup);
    if (!result.ok) throw new Error(result.reason);

    expect(await readGroupView(db, "A".repeat(22))).toBeUndefined();
    expect(
      await readGroupView(db, result.view.linkToken.slice(0, -1))
    ).toBeUndefined();
    expect(await readGroupView(db, "")).toBeUndefined();
  });
});
