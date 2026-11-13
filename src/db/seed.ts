import { appInfo } from "./schema";
import type { Db } from "./types";

/**
 * Loads the fake data for local and `development` databases; the only source
 * of data there. Production is never seeded. Safe to run more than once.
 *
 * The fake groups the spec lists are added here as their tables arrive.
 */
export async function seed(db: Db): Promise<void> {
  await db
    .insert(appInfo)
    .values({ greeting: "Potluck is connected to its database." })
    .onConflictDoNothing();
}
