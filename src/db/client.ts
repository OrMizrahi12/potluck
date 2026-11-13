import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./env";
import * as schema from "./schema";
import type { Db } from "./types";

// One pool per server process; reused across hot reloads in development.
const globalForDb = globalThis as unknown as { potluckDb?: Db };

export function getDb(): Db {
  globalForDb.potluckDb ??= drizzle({
    client: new Pool({ connectionString: databaseUrl() }),
    schema,
  });
  return globalForDb.potluckDb;
}
