import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER } from "../db/migrations-folder";
import * as schema from "../db/schema";
import type { Db } from "../db/types";

/** A fresh in-memory Postgres 18 (PGlite) with the real migrations applied. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
