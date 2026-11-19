import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` needs a request scope; outside Next it only marks the route
// dynamic, which a direct call doesn't need.
vi.mock("next/server", () => ({ connection: async () => {} }));

describe("liveness route", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("answers 200 with no database connection configured", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
