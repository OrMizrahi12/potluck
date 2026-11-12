// The only source of data for local and `development` databases. Production
// data is never copied anywhere.
//
// It applies the migrations, then loads fake data. The walking skeleton has no
// domain tables yet, so there is nothing to load; the fake groups the spec
// lists are added here as their tables arrive.
import { databaseUrl } from "../src/db/env";
import { migrateDatabase } from "../src/db/migrate";

await migrateDatabase(databaseUrl());
console.log("Seed loaded (no fake data yet).");
