import { sql } from "drizzle-orm";
import {
  unappliedMigrations,
  type JournalEntry,
} from "../../../db/migration-journal";
import { onlyRow } from "../../../db/only-row";
import type { Db } from "../../../db/types";

type Env = Record<string, string | undefined>;

export type HealthReport = {
  status: "ok" | "failing";
  /** The commit this deploy was built from, or null outside a Vercel build. */
  commit: string | null;
  database: {
    reachable: boolean;
    /** Every migration this deploy was built with is applied. */
    schemaCurrent: boolean;
    /** The database's size against the plan's limit; null if unreachable. */
    storage: { bytes: number; limitBytes: number } | null;
  };
};

/**
 * Neon Free's storage limit (checked 2026-11-17). Read as 10^9 bytes, the
 * smaller of the two ways to count a GB, so an alert at 80% comes early
 * rather than late.
 */
const STORAGE_LIMIT_BYTES = 1_000_000_000;

async function databaseBytes(db: Db): Promise<number> {
  const result = (await db.execute(
    sql`select pg_database_size(current_database())::text as bytes`
  )) as { rows: { bytes: string }[] };
  return Number(onlyRow(result.rows).bytes);
}

/**
 * What `/api/health` answers. The smoke test waits until the production
 * address names the commit it was sent for, so it knows the release moved.
 * Vercel sets `VERCEL_GIT_COMMIT_SHA` at runtime too; a production build with
 * its system variables switched off is refused (`src/db/build-source.ts`).
 */
export async function healthReport({
  openDb,
  env,
  journal,
  timeoutMs = 10_000,
}: {
  /** Opens the database; may throw when no connection is configured. */
  openDb: () => Db;
  env: Env;
  journal: JournalEntry[];
  /** How long the database gets to answer before it counts as unreachable. */
  timeoutMs?: number;
}): Promise<HealthReport> {
  const commit = env.VERCEL_GIT_COMMIT_SHA || null;
  let missing: string[];
  let bytes: number;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = openDb();
    const asks = (async () =>
      [
        await unappliedMigrations(db, journal),
        await databaseBytes(db),
      ] as const)();
    const gaveUp = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
    });
    [missing, bytes] = await Promise.race([asks, gaveUp]);
  } catch {
    // Not logged: a driver error can carry the query, and the answer already
    // says what a monitor needs to know.
    return {
      status: "failing",
      commit,
      database: { reachable: false, schemaCurrent: false, storage: null },
    };
  } finally {
    clearTimeout(timer);
  }
  const schemaCurrent = missing.length === 0;
  return {
    status: schemaCurrent ? "ok" : "failing",
    commit,
    database: {
      reachable: true,
      schemaCurrent,
      storage: { bytes, limitBytes: STORAGE_LIMIT_BYTES },
    },
  };
}
