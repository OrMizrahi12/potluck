import { describe, expect, it } from "vitest";
import { readGreeting } from "./greeting";
import { createTestDb } from "../test/db";

describe("the migrated database", () => {
  it("answers the home page's greeting", async () => {
    const db = await createTestDb();

    expect(await readGreeting(db)).toBe("Potluck is connected to its database.");
  });
});
