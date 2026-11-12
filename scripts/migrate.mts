import { databaseUrl } from "../src/db/env";
import { migrateDatabase } from "../src/db/migrate";

await migrateDatabase(databaseUrl());
console.log("Migrations applied.");
