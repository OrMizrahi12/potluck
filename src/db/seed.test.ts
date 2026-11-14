import { describe, expect, it } from "vitest";
import { readGroupView, type GroupView } from "../group/service";
import { createTestDb } from "../test/db";
import { SEED_LINKS, seed } from "./seed";

/** A seeded group's view, read after seeding a fresh database. */
async function seededGroup(link: string): Promise<GroupView> {
  const db = await createTestDb();
  await seed(db);
  const view = await readGroupView(db, link);
  if (!view) throw new Error(`no seeded group at ${link}`);
  return view;
}

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
});
