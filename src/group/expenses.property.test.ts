import { describe, expect, it } from "vitest";
import { createTestDb } from "../test/db";
import { addExpense, createGroup, readGroupView } from "./service";

/** mulberry32: a small seeded generator, so a failure reproduces from SEED. */
function generator(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  return { next, int };
}

const SEED = 20261114;
const GROUPS = 60;
const EXPENSES_PER_GROUP = 50;
// 0, 2 and 3 decimals, with HUF where browsers disagree with ISO.
const CURRENCIES = [
  { code: "JPY", digits: 0 },
  { code: "USD", digits: 2 },
  { code: "HUF", digits: 2 },
  { code: "BHD", digits: 3 },
];

/** Minor units as typed text, written out here rather than with the app's own helper. */
function typed(minor: number, digits: number): string {
  if (digits === 0) return String(minor);
  const unit = 10 ** digits;
  const fraction = String(minor % unit).padStart(digits, "0");
  return `${Math.floor(minor / unit)}.${fraction}`;
}

describe("expenses added at random", () => {
  it(`split exactly and keep balances at zero (${GROUPS * EXPENSES_PER_GROUP} expenses, seed ${SEED})`, async () => {
    const random = generator(SEED);
    const db = await createTestDb();

    for (let g = 0; g < GROUPS; g++) {
      const currency = CURRENCIES[g % CURRENCIES.length];
      const created = await createGroup(db, {
        name: `Group ${g}`,
        currency: currency.code,
        memberNames: Array.from(
          { length: random.int(2, 12) },
          (_, i) => `Member ${i}`
        ),
      });
      if (!created.ok) throw new Error(created.reason);
      const memberIds = created.view.members.map((m) => m.id);
      const amounts = new Map<string, number>();

      for (let e = 0; e < EXPENSES_PER_GROUP; e++) {
        const payerId = memberIds[random.int(0, memberIds.length - 1)];
        let participantIds = memberIds.filter(() => random.next() < 0.6);
        if (!participantIds.some((id) => id !== payerId)) {
          participantIds = [
            ...participantIds,
            memberIds.find((id) => id !== payerId)!,
          ];
        }
        // Mostly small amounts, where leftover units are common, up to the cap.
        const largest = 10_000_000 * 10 ** currency.digits;
        const magnitude = 10 ** random.int(1, Math.log10(largest));
        const minor = Math.max(
          participantIds.length,
          random.int(1, Math.min(magnitude, largest))
        );
        const description = `Expense ${e}`;

        const result = await addExpense(db, created.view.linkToken, {
          description,
          amount: typed(minor, currency.digits),
          date: "2026-11-14",
          payerId,
          participantIds,
        });
        if (!result.ok)
          throw new Error(`${description} refused: ${result.reason}`);
        amounts.set(description, minor);
      }

      const first = await readGroupView(db, created.view.linkToken, {
        expenseLimit: EXPENSES_PER_GROUP,
      });
      const second = await readGroupView(db, created.view.linkToken, {
        expenseLimit: EXPENSES_PER_GROUP,
      });
      if (!first || !second) throw new Error("group not found");

      expect(first.expenses).toHaveLength(EXPENSES_PER_GROUP);
      for (const expense of first.expenses) {
        expect(expense.amount).toBe(amounts.get(expense.description));
        const shares = expense.shares.map((s) => s.share);
        const floor = Math.floor(expense.amount / shares.length);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(expense.amount);
        for (const share of shares) expect([floor, floor + 1]).toContain(share);
      }
      expect(first.members.reduce((sum, m) => sum + m.balance, 0)).toBe(0);
      expect(second.expenses).toEqual(first.expenses);
    }
  }, 300_000);
});
