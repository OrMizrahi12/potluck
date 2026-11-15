import { describe, expect, it } from "vitest";
import { createTestDb } from "../test/db";
import { answerAsFakeFrankfurter } from "./fake-frankfurter";
import { lookUpRate } from "./rate-lookup";
import { rateSourceUrl } from "./rate-source";
import { createGroup } from "./service";

describe("the rate source", () => {
  it("is Frankfurter on a Vercel preview, whatever the configuration says", () => {
    expect(
      rateSourceUrl({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        PORT: "3000",
        RATE_SOURCE_URL: "http://localhost:3000/api/fake-frankfurter/v2",
      })
    ).toBe("https://api.frankfurter.dev/v2");
  });

  it("is Frankfurter in Production, whatever the configuration says", () => {
    expect(
      rateSourceUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        RATE_SOURCE_URL: "http://localhost:3000/api/fake-frankfurter/v2",
      })
    ).toBe("https://api.frankfurter.dev/v2");
  });

  it("is the fake Potluck serves itself when run locally", () => {
    expect(rateSourceUrl({ PORT: "3101" })).toBe(
      "http://localhost:3101/api/fake-frankfurter/v2"
    );
    expect(rateSourceUrl({})).toBe(
      "http://localhost:3000/api/fake-frankfurter/v2"
    );
  });

  it("is whatever the configuration names when run locally", () => {
    expect(
      rateSourceUrl({
        PORT: "3101",
        RATE_SOURCE_URL: "https://api.frankfurter.dev/v2",
      })
    ).toBe("https://api.frankfurter.dev/v2");
  });
});

describe("the fake rate source", () => {
  it("answers nothing on any Vercel deployment", async () => {
    const url = new URL(
      "http://localhost:3000/api/fake-frankfurter/v2/rates?from=2026-10-11&to=2026-11-10&base=CHF&quotes=EUR"
    );

    const preview = await answerAsFakeFrankfurter(url, {
      VERCEL: "1",
      VERCEL_ENV: "preview",
    });
    const production = await answerAsFakeFrankfurter(url, {
      VERCEL: "1",
      VERCEL_ENV: "production",
    });

    expect(preview.status).toBe(404);
    expect(await preview.text()).toBe("");
    expect(production.status).toBe(404);
  });

  it("answers a lookup for CHF with a rate on the asked date", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Zermatt trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    // The lookup asks the fake as it would ask Frankfurter.
    const result = await lookUpRate(
      db,
      {
        source: {
          url: "http://localhost:3000/api/fake-frankfurter/v2",
          fetch: (url, { signal }) =>
            answerAsFakeFrankfurter(new URL(url), {}, signal),
        },
        now: () => new Date("2026-11-15T12:00:00Z"),
      },
      {
        linkToken: created.view.linkToken,
        foreignCurrency: "CHF",
        date: "2026-11-10",
      }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0463", date: "2026-11-10" },
    });
  });
  it("answers a lookup for SEK with a rate from two days earlier", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Zermatt trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    // The lookup asks the fake as it would ask Frankfurter.
    const result = await lookUpRate(
      db,
      {
        source: {
          url: "http://localhost:3000/api/fake-frankfurter/v2",
          fetch: (url, { signal }) =>
            answerAsFakeFrankfurter(new URL(url), {}, signal),
        },
        now: () => new Date("2026-11-15T12:00:00Z"),
      },
      {
        linkToken: created.view.linkToken,
        foreignCurrency: "SEK",
        date: "2026-11-08",
      }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.0874", date: "2026-11-06" },
    });
  });
  it("answers a lookup for HUF as down", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Zermatt trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    // The lookup asks the fake as it would ask Frankfurter.
    const result = await lookUpRate(
      db,
      {
        source: {
          url: "http://localhost:3000/api/fake-frankfurter/v2",
          fetch: (url, { signal }) =>
            answerAsFakeFrankfurter(new URL(url), {}, signal),
        },
        now: () => new Date("2026-11-15T12:00:00Z"),
      },
      {
        linkToken: created.view.linkToken,
        foreignCurrency: "HUF",
        date: "2026-11-10",
      }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "temporary-failure" },
    });
  });
  it("answers a lookup for BOV as not covered", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Zermatt trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    // The lookup asks the fake as it would ask Frankfurter.
    const result = await lookUpRate(
      db,
      {
        source: {
          url: "http://localhost:3000/api/fake-frankfurter/v2",
          fetch: (url, { signal }) =>
            answerAsFakeFrankfurter(new URL(url), {}, signal),
        },
        now: () => new Date("2026-11-15T12:00:00Z"),
      },
      {
        linkToken: created.view.linkToken,
        foreignCurrency: "BOV",
        date: "2026-11-10",
      }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "unavailable" },
    });
  });
  it("answers a lookup for THB slower than the lookup waits", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Zermatt trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(created.reason);

    // The lookup asks the fake as it would ask Frankfurter.
    const result = await lookUpRate(
      db,
      {
        source: {
          url: "http://localhost:3000/api/fake-frankfurter/v2",
          fetch: (url, { signal }) =>
            answerAsFakeFrankfurter(new URL(url), {}, signal),
        },
        now: () => new Date("2026-11-15T12:00:00Z"),
      },
      {
        linkToken: created.view.linkToken,
        foreignCurrency: "THB",
        date: "2026-11-10",
      }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "temporary-failure" },
    });
  });
});
