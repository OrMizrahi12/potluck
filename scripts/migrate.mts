import { guardProductionBuild, readCheckoutHead } from "../src/db/build-source";
import { migrationDatabaseUrl } from "../src/db/env";
import { migrateDatabase } from "../src/db/migrate";

// First, before any connection string is read: a production build GitHub
// didn't trigger from main stops here, so nothing touches the database.
const passed = guardProductionBuild(process.env, readCheckoutHead);
if (passed) console.log(passed);

await migrateDatabase(migrationDatabaseUrl());
console.log("Migrations applied and verified.");
