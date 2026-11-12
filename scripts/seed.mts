// Applies the migrations, then loads the seed. See src/db/seed.ts.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "../src/db/env";
import { migrateDatabase } from "../src/db/migrate";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";

const url = databaseUrl();
await migrateDatabase(url);

const pool = new Pool({ connectionString: url });
try {
  await seed(drizzle({ client: pool, schema }));
  console.log("Seed loaded.");
} finally {
  await pool.end();
}
