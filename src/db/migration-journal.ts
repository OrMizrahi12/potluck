import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { MIGRATIONS_FOLDER } from "./migrations-folder";
import type { Db } from "./types";

/** One migration as drizzle-kit lists it in `meta/_journal.json`. */
export type JournalEntry = { tag: string; when: number };

export function readJournal(
  migrationsFolder = MIGRATIONS_FOLDER
): JournalEntry[] {
  const journal = JSON.parse(
    fs.readFileSync(
      path.join(migrationsFolder, "meta", "_journal.json"),
      "utf8"
    )
  ) as { entries: JournalEntry[] };
  return journal.entries.map(({ tag, when }) => ({ tag, when }));
}

/**
 * The journal's migrations whose timestamp isn't later than every one listed
 * before it. Drizzle's migrator would skip such a migration on any database
 * that already has the one before it, so this catches the out-of-order merge
 * at PR time: regenerate the named migration so it gets a newer timestamp.
 */
export function journalOutOfOrder(journal: JournalEntry[]): string[] {
  let newest = -Infinity;
  const outOfOrder: string[] = [];
  for (const entry of journal) {
    if (entry.when <= newest) outOfOrder.push(entry.tag);
    else newest = entry.when;
  }
  return outOfOrder;
}

/**
 * The journal's migrations that the database hasn't recorded as applied, in
 * journal order. Drizzle records each applied migration by its journal
 * timestamp (`created_at` = `when`), so that's what's compared. Every entry is
 * checked, not only the newest: drizzle's migrator skips any migration older
 * than the newest one applied, so a gap can sit anywhere.
 */
export async function missingMigrations(
  db: Db,
  migrationsFolder = MIGRATIONS_FOLDER
): Promise<string[]> {
  const journal = readJournal(migrationsFolder);
  const table = (await db.execute(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"`
  )) as { rows: { exists: boolean }[] };
  if (!table.rows[0]?.exists) return journal.map((entry) => entry.tag);

  const recorded = (await db.execute(
    sql`select created_at from drizzle.__drizzle_migrations`
  )) as { rows: { created_at: string | number | null }[] };
  const applied = new Set(recorded.rows.map((row) => Number(row.created_at)));
  return journal
    .filter((entry) => !applied.has(entry.when))
    .map((entry) => entry.tag);
}
