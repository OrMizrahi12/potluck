import { describe, expect, it } from "vitest";
import { journalOutOfOrder, readJournal } from "./migration-journal";

describe("the migration journal's order", () => {
  it("has timestamps that strictly increase in journal order", () => {
    expect(journalOutOfOrder(readJournal())).toEqual([]);
  });

  it("names a migration whose timestamp goes backwards, as when a branch's older migration merges after a newer one", () => {
    const journal = [
      { tag: "0004_expense_foreign_amounts", when: 1794751475757 },
      { tag: "0005_rate_lookups", when: 1794753796392 },
      { tag: "0006_older_branch", when: 1794752000000 },
    ];

    expect(journalOutOfOrder(journal)).toEqual(["0006_older_branch"]);
  });

  it("names a migration whose timestamp repeats the one before it", () => {
    const journal = [
      { tag: "0000_a", when: 1794494475701 },
      { tag: "0001_b", when: 1794494475701 },
    ];

    expect(journalOutOfOrder(journal)).toEqual(["0001_b"]);
  });
});
