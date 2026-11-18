import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "./migrations-folder";
import { migrateAndVerify } from "./migrate";
import { readJournal } from "./migration-journal";
import * as schema from "./schema";

function emptyDb() {
  return drizzle({ client: new PGlite(), schema });
}

/** A copy of the real migrations folder whose journal leaves out `tag`. */
function migrationsWithout(tag: string): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-migrations-"));
  fs.cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter(
    (entry: { tag: string }) => entry.tag !== tag
  );
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

/** The build's step on a PGlite database, with what it prints captured. */
async function runStep(
  db: ReturnType<typeof emptyDb>,
  options: { production: boolean; migrationsFolder: string }
) {
  const printed: string[] = [];
  const result = migrateAndVerify(db, {
    ...options,
    apply: (folder) => migrate(db, { migrationsFolder: folder }),
    log: (line) => printed.push(line),
  });
  return { result, printed };
}

describe("the build's migrate step", () => {
  it("refuses, naming the migration, when one was skipped because a newer one was applied first", async () => {
    const db = emptyDb();
    await migrate(db, {
      migrationsFolder: migrationsWithout("0004_expense_foreign_amounts"),
    });

    const { result } = await runStep(db, {
      production: false,
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    await expect(result).rejects.toThrow("0004_expense_foreign_amounts");
  });

  it("passes on a database migrated in order", async () => {
    const db = emptyDb();
    const newest = readJournal().at(-1)!.tag;
    await migrate(db, { migrationsFolder: migrationsWithout(newest) });

    const { result } = await runStep(db, {
      production: false,
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    await expect(result).resolves.toBeUndefined();
  });
});

describe("the restore point", () => {
  it("is printed in production, before the first migration runs, when a migration is pending", async () => {
    const db = emptyDb();
    const printed: string[] = [];

    await migrateAndVerify(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      apply: async (folder) => {
        printed.push("(first migration runs)");
        await migrate(db, { migrationsFolder: folder });
      },
      production: true,
      log: (line) => printed.push(line),
    });

    const migrating = printed.indexOf("(first migration runs)");
    const before = printed.slice(0, migrating).join("\n");
    const lsn = before.match(/LSN:\s+([0-9A-F]+\/[0-9A-F]+)/)?.[1];
    expect(lsn).toBeDefined();
    expect(before).toMatch(/Time:\s+\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/);
    expect(before).toContain(`neon branches restore production ^self@${lsn}`);
    expect(before).toContain("--preserve-under-name production_before_");
  });

  it("holds no connection string or other secret", async () => {
    const db = emptyDb();
    const { result, printed } = await runStep(db, {
      production: true,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    await result;

    const text = printed.join("\n");
    expect(text).not.toMatch(/:\/\/|password|npg_|DATABASE_URL/i);
  });

  it("isn't printed outside production", async () => {
    const db = emptyDb();

    const { result, printed } = await runStep(db, {
      production: false,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    await result;

    expect(printed).toEqual([]);
  });

  it("isn't printed in production when nothing is pending", async () => {
    const db = emptyDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const { result, printed } = await runStep(db, {
      production: true,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    await result;

    expect(printed).toEqual([]);
  });
});
