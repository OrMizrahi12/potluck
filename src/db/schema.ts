import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";

// Walking-skeleton table: one row, written by the first migration and read by
// the home page, to prove the app reaches a migrated database.
export const appInfo = pgTable(
  "app_info",
  {
    id: integer("id").primaryKey().default(1),
    greeting: text("greeting").notNull(),
  },
  (t) => [check("app_info_single_row", sql`${t.id} = 1`)],
);
