import { describe, expect, it } from "vitest";
import type { Db } from "../db/types";
import { createTestDb } from "../test/db";
import { lookUpRate, type RateSource } from "./rate-lookup";
import { createGroup } from "./service";

/** A fresh group in `currency`, answering its link. */
async function groupIn(db: Db, currency: string): Promise<string> {
  const created = await createGroup(db, {
    name: "Zermatt trip",
    currency,
    memberNames: ["Ana", "Ben"],
  });
  if (!created.ok) throw new Error(created.reason);
  return created.view.linkToken;
}

/** One rate as Frankfurter publishes it; `rate` is the number's JSON text. */
type Published = { date: string; rate: string };

/**
 * A stand-in for Frankfurter v2's range query (`/rates?from&to&base&quotes`):
 * it answers the rates published between `from` and `to`, written out as
 * Frankfurter writes them, with the rate as a bare JSON number.
 */
function frankfurter(published: Published[]): RateSource & { asked: URL[] } {
  const asked: URL[] = [];
  return {
    asked,
    url: "https://rates.example/v2",
    fetch: async (input) => {
      const url = new URL(String(input));
      asked.push(url);
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      const base = url.searchParams.get("base");
      const quote = url.searchParams.get("quotes");
      const rows = published
        .filter((p) => p.date >= from && p.date <= to)
        .map(
          (p) =>
            `{"date":"${p.date}","base":"${base}","quote":"${quote}","rate":${p.rate}}`
        );
      return new Response(`[${rows.join(",")}]`, {
        headers: { "content-type": "application/json" },
      });
    },
  };
}

/** A source that answers every request with `status` and Frankfurter's error body. */
function failing(status: number): RateSource {
  return {
    url: "https://rates.example/v2",
    fetch: async () =>
      Response.json({ status, message: "not found" }, { status }),
  };
}

/** A clock stopped at `iso`. */
function at(iso: string) {
  return () => new Date(iso);
}

describe("rate lookup", () => {
  it("finds the rate published on the entry's date", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const source = frankfurter([
      { date: "2026-11-09", rate: "1.0455" },
      { date: "2026-11-10", rate: "1.0463" },
    ]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-10" }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0463", date: "2026-11-10" },
    });
    // Frankfurter's base is the foreign currency, its quote the group's.
    expect(source.asked[0].searchParams.get("base")).toBe("CHF");
    expect(source.asked[0].searchParams.get("quotes")).toBe("EUR");
  });

  it("keeps every digit of the rate the source published", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "BHD");
    // IRR→BHD is 0.000000196; a float would read 1.0 back as 1, and JSON
    // may write a tiny number in exponent form.
    const source = frankfurter([
      { date: "2026-11-09", rate: "1.0" },
      { date: "2026-11-10", rate: "1.96e-7" },
    ]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "IRR", date: "2026-11-10" }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.000000196", date: "2026-11-10" },
    });
  });

  it("finds the latest rate published before a date with none", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // Nothing published on Sunday 8 Nov; Friday 6 Nov is the latest before it.
    const source = frankfurter([
      { date: "2026-11-05", rate: "1.0431" },
      { date: "2026-11-06", rate: "1.0447" },
      { date: "2026-11-09", rate: "1.0455" },
    ]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-08" }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0447", date: "2026-11-06" },
    });
  });

  it("finds the latest rate for a date after today", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const source = frankfurter([
      { date: "2026-11-14", rate: "1.081" },
      { date: "2026-11-15", rate: "1.0809" },
    ]);

    // A hotel booked for 1 Feb 2027, recorded on 15 Nov 2026: 78 days ahead,
    // so the latest rate is far more than 30 days before the entry's date,
    // yet it's as fresh as a rate can be.
    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2027-02-01" }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0809", date: "2026-11-15" },
    });
  });

  it("proposes a rate published 30 days before the entry's date", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // 10 Nov − 30 days = 11 Oct (October has 31 days).
    const source = frankfurter([{ date: "2026-10-11", rate: "0.0376" }]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CUP", date: "2026-11-10" }
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.0376", date: "2026-10-11" },
    });
  });

  it("calls a rate published 31 days before the entry's date unavailable", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // 10 Nov − 31 days = 10 Oct.
    const source = frankfurter([{ date: "2026-10-10", rate: "0.0376" }]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CUP", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "unavailable" } });
  });

  it("calls a rate published 31 days before unavailable when the source sends it anyway", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // A source that ignores `from` and sends its whole history.
    const source: RateSource = {
      url: "https://rates.example/v2",
      fetch: async () =>
        new Response(
          '[{"date":"2026-10-10","base":"CUP","quote":"EUR","rate":0.0376}]'
        ),
    };

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CUP", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "unavailable" } });
  });

  it("calls a currency the source doesn't cover unavailable", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // Frankfurter answers 422 "invalid currency: BOV" for a code it lacks.
    const result = await lookUpRate(
      db,
      { source: failing(422), now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "BOV", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "unavailable" } });
  });

  it("calls a date before the currency's first rate unavailable", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // Frankfurter answers 404 "not found" before a currency's history starts.
    const result = await lookUpRate(
      db,
      { source: failing(404), now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "XCG", date: "2025-03-30" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "unavailable" } });
  });

  it("is refused for a link no group has, without asking the source", async () => {
    const db = await createTestDb();
    await groupIn(db, "EUR");
    const source = frankfurter([{ date: "2026-11-10", rate: "1.0463" }]);

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      {
        linkToken: "AAAAAAAAAAAAAAAAAAAAAA",
        foreignCurrency: "CHF",
        date: "2026-11-10",
      }
    );

    expect(result).toEqual({ ok: false, reason: "group-unknown" });
    expect(source.asked).toEqual([]);
  });

  it("is refused for the group currency, a code off the picker or an unreadable date", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const source = frankfurter([{ date: "2026-11-10", rate: "1.0463" }]);
    const deps = { source, now: at("2026-11-15T12:00:00Z") };

    expect(
      await lookUpRate(db, deps, {
        linkToken,
        foreignCurrency: "EUR",
        date: "2026-11-10",
      })
    ).toEqual({ ok: false, reason: "foreign-currency-is-group-currency" });
    expect(
      await lookUpRate(db, deps, {
        linkToken,
        foreignCurrency: "XAU",
        date: "2026-11-10",
      })
    ).toEqual({ ok: false, reason: "foreign-currency-unknown" });
    expect(
      await lookUpRate(db, deps, {
        linkToken,
        foreignCurrency: "CHF",
        date: "2026-02-30",
      })
    ).toEqual({ ok: false, reason: "date-unreadable" });
    expect(source.asked).toEqual([]);
  });

  it("calls a source error a temporary failure", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");

    const result = await lookUpRate(
      db,
      { source: failing(503), now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "temporary-failure" } });
  });

  it("calls an unreachable source a temporary failure", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const source: RateSource = {
      url: "https://rates.example/v2",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    };

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "temporary-failure" } });
  });

  it("calls a source with no answer within 4 seconds a temporary failure", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    // Answers only when the lookup gives up on it, as fetch does.
    const source: RateSource = {
      url: "https://rates.example/v2",
      fetch: (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason))
        ),
    };

    const started = Date.now();
    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-10" }
    );
    const waited = Date.now() - started;

    expect(result).toEqual({ ok: true, answer: { kind: "temporary-failure" } });
    expect(waited).toBeGreaterThanOrEqual(3_900);
    expect(waited).toBeLessThan(6_000);
  });

  it("keeps a rate found for a past date for good", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const entry = { linkToken, foreignCurrency: "CHF", date: "2026-11-10" };
    await lookUpRate(
      db,
      {
        source: frankfurter([{ date: "2026-11-10", rate: "1.0463" }]),
        now: at("2026-11-15T12:00:00Z"),
      },
      entry
    );

    // A year on, with the source down, the rate is still there.
    const down = failing(503);
    const result = await lookUpRate(
      db,
      { source: down, now: at("2027-11-15T12:00:00Z") },
      entry
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0463", date: "2026-11-10" },
    });
  });

  it("keeps a rate found for today for one hour", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const entry = { linkToken, foreignCurrency: "CHF", date: "2026-11-15" };
    await lookUpRate(
      db,
      {
        source: frankfurter([{ date: "2026-11-14", rate: "1.081" }]),
        now: at("2026-11-15T12:00:00Z"),
      },
      entry
    );
    // Today's rate has been published since.
    const later = frankfurter([
      { date: "2026-11-14", rate: "1.081" },
      { date: "2026-11-15", rate: "1.0809" },
    ]);

    const within = await lookUpRate(
      db,
      { source: later, now: at("2026-11-15T12:59:00Z") },
      entry
    );
    const after = await lookUpRate(
      db,
      { source: later, now: at("2026-11-15T13:01:00Z") },
      entry
    );

    expect(within).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.081", date: "2026-11-14" },
    });
    expect(after).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0809", date: "2026-11-15" },
    });
  });

  it("keeps a rate found for a date after today for one hour", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const entry = { linkToken, foreignCurrency: "CHF", date: "2026-12-24" };
    await lookUpRate(
      db,
      {
        source: frankfurter([{ date: "2026-11-15", rate: "1.0809" }]),
        now: at("2026-11-15T23:30:00Z"),
      },
      entry
    );
    const later = frankfurter([
      { date: "2026-11-15", rate: "1.0809" },
      { date: "2026-11-16", rate: "1.0822" },
    ]);

    const within = await lookUpRate(
      db,
      { source: later, now: at("2026-11-16T00:29:00Z") },
      entry
    );
    const after = await lookUpRate(
      db,
      { source: later, now: at("2026-11-16T00:31:00Z") },
      entry
    );

    // Within the hour the lookup made late on the 15th still stands, even
    // past midnight; after it, the 16th's rate is the latest.
    expect(within).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0809", date: "2026-11-15" },
    });
    expect(after).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0822", date: "2026-11-16" },
    });
  });

  it("keeps an unavailable answer for one hour", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const entry = { linkToken, foreignCurrency: "VED", date: "2026-11-10" };
    await lookUpRate(
      db,
      { source: failing(422), now: at("2026-11-15T12:00:00Z") },
      entry
    );
    // The source has added the currency since.
    const later = frankfurter([{ date: "2026-11-10", rate: "0.0021" }]);

    const within = await lookUpRate(
      db,
      { source: later, now: at("2026-11-15T12:59:00Z") },
      entry
    );
    const after = await lookUpRate(
      db,
      { source: later, now: at("2026-11-15T13:01:00Z") },
      entry
    );

    expect(within).toEqual({ ok: true, answer: { kind: "unavailable" } });
    expect(after).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.0021", date: "2026-11-10" },
    });
  });

  it("never keeps a temporary failure", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const entry = { linkToken, foreignCurrency: "CHF", date: "2026-11-10" };
    await lookUpRate(
      db,
      { source: failing(503), now: at("2026-11-15T12:00:00Z") },
      entry
    );

    const result = await lookUpRate(
      db,
      {
        source: frankfurter([{ date: "2026-11-10", rate: "1.0463" }]),
        now: at("2026-11-15T12:00:01Z"),
      },
      entry
    );

    expect(result).toEqual({
      ok: true,
      answer: { kind: "found", rate: "1.0463", date: "2026-11-10" },
    });
  });

  it("keeps rates apart by currency pair and date", async () => {
    const db = await createTestDb();
    const eur = await groupIn(db, "EUR");
    const gbp = await groupIn(db, "GBP");
    const now = at("2026-11-15T12:00:00Z");
    await lookUpRate(
      db,
      { source: frankfurter([{ date: "2026-11-10", rate: "1.0463" }]), now },
      { linkToken: eur, foreignCurrency: "CHF", date: "2026-11-10" }
    );
    const other = frankfurter([
      { date: "2026-11-09", rate: "0.9114" },
      { date: "2026-11-10", rate: "0.9121" },
    ]);

    const otherGroupCurrency = await lookUpRate(
      db,
      { source: other, now },
      { linkToken: gbp, foreignCurrency: "CHF", date: "2026-11-10" }
    );
    const otherDate = await lookUpRate(
      db,
      { source: other, now },
      { linkToken: eur, foreignCurrency: "CHF", date: "2026-11-09" }
    );

    expect(otherGroupCurrency).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.9121", date: "2026-11-10" },
    });
    expect(otherDate).toEqual({
      ok: true,
      answer: { kind: "found", rate: "0.9114", date: "2026-11-09" },
    });
  });

  it("calls an unreadable answer a temporary failure", async () => {
    const db = await createTestDb();
    const linkToken = await groupIn(db, "EUR");
    const source: RateSource = {
      url: "https://rates.example/v2",
      fetch: async () => new Response("<html>Bad gateway</html>"),
    };

    const result = await lookUpRate(
      db,
      { source, now: at("2026-11-15T12:00:00Z") },
      { linkToken, foreignCurrency: "CHF", date: "2026-11-10" }
    );

    expect(result).toEqual({ ok: true, answer: { kind: "temporary-failure" } });
  });
});
