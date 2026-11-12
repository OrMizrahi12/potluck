import { migrationDatabaseUrl } from "../src/db/env";
import { migrateDatabase } from "../src/db/migrate";

await migrateDatabase(migrationDatabaseUrl());
console.log("Migrations applied.");
