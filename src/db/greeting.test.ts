import { describe, expect, it } from "vitest";
import { readGreeting } from "./greeting";
import { seed } from "./seed";
import { createTestDb } from "../test/db";

describe("the home page's greeting", () => {
  it("comes from the seed", async () => {
    const db = await createTestDb();
    await seed(db);

    expect(await readGreeting(db)).toBe("Potluck is connected to its database.");
  });

  it("is absent from a database that was only migrated", async () => {
    const db = await createTestDb();

    expect(await readGreeting(db)).toBeUndefined();
  });

  it("survives seeding twice", async () => {
    const db = await createTestDb();
    await seed(db);
    await seed(db);

    expect(await readGreeting(db)).toBe("Potluck is connected to its database.");
  });
});
