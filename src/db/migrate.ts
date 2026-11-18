import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { missingMigrations } from "./migration-journal";
import { MIGRATIONS_FOLDER } from "./migrations-folder";
import * as schema from "./schema";
import type { Db } from "./types";

// Arbitrary but fixed: every migration run in every environment takes this lock.
const MIGRATION_LOCK_KEY = 7_406_812_001;

export type MigrateStepOptions = {
  migrationsFolder: string;
  /** Runs drizzle's migrator for this database's driver. */
  apply: (migrationsFolder: string) => Promise<void>;
  /** True only for a production build: it alone records a restore point. */
  production: boolean;
  log: (line: string) => void;
};

// Production runs on Neon's root branch, named `production` (setup-hosting.sh).
const PRODUCTION_BRANCH = "production";

/**
 * Where production stands just before migrating: its current WAL position and
 * time. Not a backup; Neon can restore the root branch to it while it's still
 * inside Neon's ~6-hour history. Holds no connection string or secret.
 */
type RestorePoint = { lsn: string; time: string };

async function readRestorePoint(db: Db): Promise<RestorePoint> {
  const result = (await db.execute(
    sql`select pg_current_wal_lsn()::text as lsn,
      to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as time`
  )) as { rows: RestorePoint[] };
  return result.rows[0];
}

function restorePointLines(
  { lsn, time }: RestorePoint,
  pending: string[]
): string[] {
  // 2026-11-18T14:47:53.199Z -> 20261118_144753
  const stamp = time.slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
  return [
    `Restore point before migrating production (pending: ${pending.join(", ")})`,
    `  LSN:  ${lsn}`,
    `  Time: ${time}`,
    "To restore production's root branch to this point (a person's call, only within Neon's ~6-hour history), run:",
    `  neon branches restore ${PRODUCTION_BRANCH} ^self@${lsn} --preserve-under-name ${PRODUCTION_BRANCH}_before_${stamp}`,
  ];
}

/**
 * The build's migrate step: restore point, migrate, verify.
 *
 * - In production, when a migration is pending, prints a restore point first.
 * - Migrates.
 * - Verifies that every migration in the journal is recorded as applied, and
 *   fails naming any that isn't, so the build fails and the previous release
 *   keeps serving.
 */
export async function migrateAndVerify(
  db: Db,
  options: MigrateStepOptions
): Promise<void> {
  if (options.production) {
    const pending = await missingMigrations(db, options.migrationsFolder);
    if (pending.length > 0) {
      for (const line of restorePointLines(
        await readRestorePoint(db),
        pending
      )) {
        options.log(line);
      }
    }
  }

  await options.apply(options.migrationsFolder);

  const missing = await missingMigrations(db, options.migrationsFolder);
  if (missing.length > 0) {
    throw new Error(
      `Migrations not applied: ${missing.join(", ")}. Drizzle skips a migration older than the newest one applied; regenerate it with a newer timestamp.`
    );
  }
}

/**
 * Applies pending migrations while holding a session-level Postgres advisory
 * lock, so a second concurrent run waits for the first instead of racing it.
 * The lock lives on one dedicated connection and is released when it closes.
 */
export async function migrateDatabase(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      const db = drizzle({ client, schema });
      await migrateAndVerify(db, {
        migrationsFolder: MIGRATIONS_FOLDER,
        apply: (migrationsFolder) => migrate(db, { migrationsFolder }),
        production: process.env.VERCEL_ENV === "production",
        log: (line) => console.log(line),
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}
