import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
// The journal as the route ships it: imported, so it's inside the function.
import journal from "../../../../drizzle/meta/_journal.json";
import * as schema from "../../../db/schema";
import type { Db } from "../../../db/types";
import { createTestDb } from "../../../test/db";
import { healthReport } from "./health-report";

describe("health report", () => {
  it("says the database answers at the current schema", async () => {
    const db = await createTestDb();

    const report = await healthReport({
      openDb: () => db,
      env: {
        VERCEL_GIT_COMMIT_SHA: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      },
      journal: journal.entries,
    });

    expect(report).toMatchObject({
      status: "ok",
      commit: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      database: { reachable: true, schemaCurrent: true },
    });
  });

  it("reports the database's size in bytes against Neon Free's 1 GB", async () => {
    const db = await createTestDb();

    const report = await healthReport({
      openDb: () => db,
      env: {},
      journal: journal.entries,
    });

    expect(report.database.storage).toEqual({
      bytes: expect.any(Number),
      limitBytes: 1_000_000_000,
    });
    // A migrated Postgres database is a few megabytes, never empty.
    expect(report.database.storage!.bytes).toBeGreaterThan(1_000_000);
    expect(report.database.storage!.bytes).toBeLessThan(1_000_000_000);
  });

  it("says the schema isn't current when the deploy has a migration the database lacks", async () => {
    const db = await createTestDb();

    const report = await healthReport({
      openDb: () => db,
      env: {},
      journal: [
        ...journal.entries,
        { tag: "0099_not_applied", when: 4_102_444_800_000 },
      ],
    });

    expect(report).toMatchObject({
      status: "failing",
      database: { reachable: true, schemaCurrent: false },
    });
  });

  it("says the database doesn't answer, still naming the commit", async () => {
    const client = new PGlite();
    await client.close();

    const report = await healthReport({
      openDb: () => drizzle({ client, schema }),
      env: {
        VERCEL_GIT_COMMIT_SHA: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      },
      journal: journal.entries,
    });

    expect(report).toEqual({
      status: "failing",
      commit: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      database: { reachable: false, schemaCurrent: false, storage: null },
    });
  });

  it("says the database doesn't answer when no connection is configured", async () => {
    const report = await healthReport({
      openDb: () => {
        throw new Error("DATABASE_URL is not set.");
      },
      env: {
        VERCEL_GIT_COMMIT_SHA: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      },
      journal: journal.entries,
    });

    expect(report).toEqual({
      status: "failing",
      commit: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      database: { reachable: false, schemaCurrent: false, storage: null },
    });
  });

  it("says the database doesn't answer when it hangs past the wait", async () => {
    // A database that never answers, as a cold or cut-off Neon can.
    const hangs = { execute: () => new Promise(() => {}) } as unknown as Db;

    const report = await healthReport({
      openDb: () => hangs,
      env: {},
      journal: journal.entries,
      timeoutMs: 50,
    });

    expect(report.database).toEqual({
      reachable: false,
      schemaCurrent: false,
      storage: null,
    });
  });

  it("names no commit outside a Vercel build", async () => {
    const db = await createTestDb();

    const report = await healthReport({
      openDb: () => db,
      env: {},
      journal: journal.entries,
    });

    expect(report.commit).toBeNull();
  });

  it("names no commit when the variable is empty", async () => {
    const db = await createTestDb();

    const report = await healthReport({
      openDb: () => db,
      env: { VERCEL_GIT_COMMIT_SHA: "" },
      journal: journal.entries,
    });

    expect(report.commit).toBeNull();
  });
});
