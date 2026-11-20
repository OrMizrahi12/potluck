import { describe, expect, it } from "vitest";
import { checkMigrations } from "./check-migrations.mjs";

// Each test that has no drop gives a GitHub that throws when asked: only a
// drop may look up PRs and releases.

describe("migration check", () => {
  it("passes a migration that only adds", async () => {
    const result = await checkMigrations({
      migrations: [
        {
          path: "drizzle/0008_receipts.sql",
          change: "added",
          sql: [
            'CREATE TABLE "receipts" ("id" text PRIMARY KEY NOT NULL, "expense_id" text NOT NULL REFERENCES "expenses"("id"), "note" text, CONSTRAINT "receipts_note_length" CHECK (length("note") < 200), CONSTRAINT "receipts_expense_unique" UNIQUE("expense_id"));',
            "--> statement-breakpoint",
            'CREATE UNIQUE INDEX "receipts_note_index" ON "receipts" USING btree ("note");',
            "--> statement-breakpoint",
            'CREATE INDEX "expenses_date_index" ON "expenses" USING btree ("date");',
            "--> statement-breakpoint",
            'ALTER TABLE "expenses" ADD COLUMN "receipt_count" integer DEFAULT 0 NOT NULL;',
            "--> statement-breakpoint",
            'ALTER TABLE "expenses" ADD COLUMN "receipt_note" text;',
          ].join("\n"),
        },
      ],
      prBody: async () => "",
      github: {
        pullRequest: () => {
          throw new Error("asked for a PR");
        },
        productionRelease: () => {
          throw new Error("asked for production's release");
        },
        includes: () => {
          throw new Error("asked whether a release includes a commit");
        },
      },
      codeMentions: async () => [],
    });

    expect(result.passed).toBe(true);
  });

  it.each([
    [
      "a column whose name is a keyword",
      'ALTER TABLE "expenses" ADD COLUMN "check" text;',
    ],
    [
      "a serial column, NOT NULL",
      'ALTER TABLE "expenses" ADD COLUMN "position" serial NOT NULL;',
    ],
    [
      "an identity column, NOT NULL",
      'ALTER TABLE "expenses" ADD COLUMN "position" integer GENERATED ALWAYS AS IDENTITY NOT NULL;',
    ],
  ])("passes adding %s", async (_, sql) => {
    const result = await checkMigrations({
      migrations: [{ path: "drizzle/0008_add.sql", change: "added", sql }],
      prBody: async () => "",
      github: {
        pullRequest: () => {
          throw new Error("asked for a PR");
        },
        productionRelease: () => {
          throw new Error("asked for production's release");
        },
        includes: () => {
          throw new Error("asked whether a release includes a commit");
        },
      },
      codeMentions: async () => [],
    });

    expect(result).toEqual({ passed: true, summary: expect.any(String) });
  });

  it.each([
    ['DROP TABLE "receipts";'],
    ['ALTER TABLE "expenses" DROP COLUMN "receipt_note";'],
    ['ALTER TABLE "expenses" DROP CONSTRAINT "expenses_positive";'],
    ['DROP INDEX "expenses_date_index";'],
    ['ALTER TABLE "expenses" ALTER COLUMN "description" DROP NOT NULL;'],
  ])("fails %s when the PR names no stop-using PR", async (sql) => {
    const result = await checkMigrations({
      migrations: [{ path: "drizzle/0008_drop.sql", change: "added", sql }],
      prBody: async () => "Drops what nothing reads any more.",
      github: {
        pullRequest: () => {
          throw new Error("asked for a PR");
        },
        productionRelease: () => {
          throw new Error("asked for production's release");
        },
        includes: () => {
          throw new Error("asked whether a release includes a commit");
        },
      },
      codeMentions: async () => [],
    });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("Stops using: #");
  });

  it("fails a drop whose stop-using PR is merged but not in production's release", async () => {
    const result = await checkMigrations({
      migrations: [
        {
          path: "drizzle/0008_drop_receipts.sql",
          change: "added",
          sql: 'DROP TABLE "receipts";',
        },
      ],
      prBody: async () => "Drops receipts.\n\nStops using: #74\n",
      github: {
        pullRequest: async (n: number) =>
          n === 74
            ? {
                merged: true,
                mergeCommit: "c74c74c74c74c74c74c74c74c74c74c74c74c74c",
              }
            : null,
        productionRelease: async () => ({
          commit: "0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0",
        }),
        includes: async () => false,
      },
      codeMentions: async () => [],
    });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("#74");
    expect(result.summary).toContain(
      "0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0"
    );
  });

  it("fails a drop whose stop-using PR isn't merged", async () => {
    const result = await checkMigrations({
      migrations: [
        {
          path: "drizzle/0008_drop_receipts.sql",
          change: "added",
          sql: 'DROP TABLE "receipts";',
        },
      ],
      prBody: async () => "Stops using: #74",
      github: {
        pullRequest: async () => ({ merged: false, mergeCommit: null }),
        productionRelease: async () => ({
          commit: "0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0ld0",
        }),
        includes: async () => false,
      },
      codeMentions: async () => [],
    });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("#74");
  });

  it.each([
    ['DROP TABLE "receipts";'],
    ['ALTER TABLE "expenses" DROP COLUMN "receipt_note";'],
    [
      // What drizzle-kit writes for a column with a foreign key and an index.
      [
        'ALTER TABLE "expenses" DROP CONSTRAINT "expenses_receipt_id_receipts_id_fk";',
        "--> statement-breakpoint",
        'DROP INDEX "expenses_receipt_index";',
        "--> statement-breakpoint",
        'ALTER TABLE "expenses" DROP COLUMN "receipt_id";',
      ].join("\n"),
    ],
    ['ALTER TABLE "expenses" ALTER COLUMN "description" DROP NOT NULL;'],
  ])("passes %s once its stop-using PR is released", async (sql) => {
    const result = await checkMigrations({
      migrations: [{ path: "drizzle/0008_drop.sql", change: "added", sql }],
      prBody: async () => "Stops using: #74",
      github: {
        pullRequest: async () => ({
          merged: true,
          mergeCommit: "c74c74c74c74c74c74c74c74c74c74c74c74c74c",
        }),
        productionRelease: async () => ({
          commit: "new0new0new0new0new0new0new0new0new0new0",
        }),
        includes: async (release: string, commit: string) =>
          release === "new0new0new0new0new0new0new0new0new0new0" &&
          commit === "c74c74c74c74c74c74c74c74c74c74c74c74c74c",
      },
      codeMentions: async () => [],
    });

    expect(result.passed).toBe(true);
  });

  it.each([
    ['DROP TABLE "receipts";', "receipts"],
    ['ALTER TABLE "expenses" DROP COLUMN "receipt_note";', "receipt_note"],
  ])("fails %s while the code still names %s", async (sql, name) => {
    const result = await checkMigrations({
      migrations: [{ path: "drizzle/0008_drop.sql", change: "added", sql }],
      prBody: async () => "Stops using: #74",
      github: {
        pullRequest: async () => ({
          merged: true,
          mergeCommit: "c74c74c74c74c74c74c74c74c74c74c74c74c74c",
        }),
        productionRelease: async () => ({
          commit: "new0new0new0new0new0new0new0new0new0new0",
        }),
        includes: async () => true,
      },
      codeMentions: async (searched: string) =>
        searched === name ? ["src/db/schema.ts"] : [],
    });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("src/db/schema.ts");
  });

  it.each([
    ["renames a table", 'ALTER TABLE "expenses" RENAME TO "costs";'],
    [
      "renames a column",
      'ALTER TABLE "expenses" RENAME COLUMN "description" TO "label";',
    ],
    [
      "renames a constraint",
      'ALTER TABLE "expenses" RENAME CONSTRAINT "a" TO "b";',
    ],
    [
      "changes a column's type",
      'ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE numeric;',
    ],
    [
      "adds a column that is NOT NULL without a default",
      'ALTER TABLE "expenses" ADD COLUMN "category" text NOT NULL;',
    ],
    [
      "adds a column named default that is NOT NULL",
      'ALTER TABLE "expenses" ADD COLUMN "default" text NOT NULL;',
    ],
    [
      "makes an existing column NOT NULL",
      'ALTER TABLE "expenses" ALTER COLUMN "description" SET NOT NULL;',
    ],
    [
      "adds a CHECK to an existing table",
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_positive" CHECK ("amount" > 0);',
    ],
    [
      "adds a column with its own CHECK",
      'ALTER TABLE "expenses" ADD COLUMN "tip" integer CHECK ("tip" >= 0);',
    ],
    [
      "adds a UNIQUE to an existing table",
      'ALTER TABLE "members" ADD CONSTRAINT "members_name_unique" UNIQUE("group_id","name");',
    ],
    [
      "adds a unique index on an existing table",
      'CREATE UNIQUE INDEX "members_name_index" ON "members" USING btree ("name");',
    ],
    [
      "adds a column with its own UNIQUE",
      'ALTER TABLE "members" ADD COLUMN "email" text UNIQUE;',
    ],
    [
      "adds a FK to an existing table",
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;',
    ],
    [
      "adds a column with its own FK",
      'ALTER TABLE "expenses" ADD COLUMN "receipt_id" text REFERENCES "receipts"("id");',
    ],
    [
      "adds a primary key to an existing table",
      'ALTER TABLE "rate_lookups" ADD PRIMARY KEY ("id");',
    ],
    [
      "drops and adds in the same PR",
      'DROP TABLE "receipts";\nCREATE TABLE "notes" ("id" text PRIMARY KEY);',
    ],
    ["drops a table with CASCADE", 'DROP TABLE "receipts" CASCADE;'],
    [
      "drops a default",
      'ALTER TABLE "expenses" ALTER COLUMN "date" DROP DEFAULT;',
    ],
    [
      "runs something the check can't read",
      "DO $$ BEGIN DELETE FROM expenses; END $$;",
    ],
  ])(
    "fails a migration that %s, even naming a released stop-using PR",
    async (_, sql) => {
      const result = await checkMigrations({
        migrations: [{ path: "drizzle/0008_change.sql", change: "added", sql }],
        prBody: async () => "Stops using: #74",
        github: {
          pullRequest: async () => ({
            merged: true,
            mergeCommit: "c74c74c74c74c74c74c74c74c74c74c74c74c74c",
          }),
          productionRelease: async () => ({
            commit: "new0new0new0new0new0new0new0new0new0new0",
          }),
          includes: async () => true,
        },
        codeMentions: async () => [],
      });

      expect(result.passed).toBe(false);
      expect(result.summary).toContain("drizzle/0008_change.sql");
    }
  );

  it.each([["modified" as const], ["deleted" as const]])(
    "fails when a migration main already has is %s",
    async (change) => {
      const result = await checkMigrations({
        migrations: [
          {
            path: "drizzle/0003_settlements.sql",
            change,
            sql: 'ALTER TABLE "settlements" ADD COLUMN "note" text;',
          },
        ],
        prBody: async () => "",
        github: {
          pullRequest: () => {
            throw new Error("asked for a PR");
          },
          productionRelease: () => {
            throw new Error("asked for production's release");
          },
          includes: () => {
            throw new Error("asked whether a release includes a commit");
          },
        },
        codeMentions: async () => [],
      });

      expect(result.passed).toBe(false);
      expect(result.summary).toContain("drizzle/0003_settlements.sql");
    }
  );
});
