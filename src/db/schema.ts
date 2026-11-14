import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Walking-skeleton table: one row, written by the seed. The home page no
// longer reads it; it stays because migrations may only add things.
export const appInfo = pgTable(
  "app_info",
  {
    id: integer("id").primaryKey().default(1),
    greeting: text("greeting").notNull(),
  },
  (t) => [check("app_info_single_row", sql`${t.id} = 1`)]
);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The group's only credential: the random token in its link.
  linkToken: text("link_token").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    // Creation order within the group, from 0.
    position: integer("position").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("members_group_position_unique").on(t.groupId, t.position),
    // Backstop for the service's rule: names are unique ignoring case and surrounding spaces.
    uniqueIndex("members_group_name_unique").on(
      t.groupId,
      sql`lower(btrim(${t.name}))`
    ),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    // Assigned at creation and never changed: the odd-cent rule hashes it.
    // A UUID's text is ASCII, as that hash requires.
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    // Minor units. 10,000,000 major units in a 4-digit currency needs more
    // than 32 bits, and stays well inside a double's exact integers.
    amount: bigint("amount", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    // No cascade: a member an expense references can't be deleted.
    payerId: uuid("payer_id")
      .notNull()
      .references(() => members.id),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("expenses_amount_positive", sql`${t.amount} > 0`),
    // The group page lists expenses newest first.
    index("expenses_group_newest_first").on(
      t.groupId,
      t.date.desc(),
      t.createdAt.desc(),
      t.id.desc()
    ),
  ]
);

export const expenseParticipants = pgTable(
  "expense_participants",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    // No cascade: a member an expense references can't be deleted.
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] })]
);
