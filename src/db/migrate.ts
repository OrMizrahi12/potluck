import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { MIGRATIONS_FOLDER } from "./migrations-folder";

// Arbitrary but fixed: every migration run in every environment takes this lock.
const MIGRATION_LOCK_KEY = 7_406_812_001;

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
      await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}
