// Looking up the exchange rate a form proposes for a foreign amount, from
// Frankfurter v2 on Potluck's server: the browser never talks to the rate
// source, and only someone holding the group link can trigger a lookup.
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { rateLookups } from "../db/schema";
import type { Db } from "../db/types";
import { checkForeignCurrency, isCalendarDate } from "./checks";
import { readGroupCurrency } from "./service";

/** A rate published more than this many days before the entry's date is unavailable. */
const STALE_AFTER_DAYS = 30;
/** How long a lookup waits for the source before calling it a temporary failure. */
const TIMEOUT_MS = 4000;
/** How long an answer that may still change is kept: any but a rate published for the past date asked. */
const KEEP_FOR_MS = 60 * 60 * 1000;

/** Where rates come from: Frankfurter v2's base URL, and how to reach it. */
export type RateSource = {
  /** e.g. "https://api.frankfurter.dev/v2", with no trailing slash. */
  url: string;
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
};

/** What a lookup answers. */
export type RateAnswer =
  /** The exchange rate as a decimal string, and the date it was published for. */
  | { kind: "found"; rate: string; date: string }
  /** The source covers no rate for this pair and date, or only a stale one: don't retry. */
  | { kind: "unavailable" }
  /** The source errored or didn't answer in time: worth trying again. */
  | { kind: "temporary-failure" };

export type RateLookupRefusal =
  | "group-unknown"
  | "foreign-currency-unknown"
  | "foreign-currency-is-group-currency"
  | "date-unreadable";

/**
 * The exchange rate for an entry of the group with `linkToken`, paid in
 * `foreignCurrency` on `date` (YYYY-MM-DD): the rate published that day, or
 * the latest before it, unavailable when that is more than 30 days earlier.
 * Answers are kept in `rate_lookups`: a rate published for the past date
 * asked for good, anything else that isn't a temporary failure for an hour. `now` is the
 * clock; "today" is its UTC date.
 */
export async function lookUpRate(
  db: Db,
  { source, now }: { source: RateSource; now: () => Date },
  {
    linkToken,
    foreignCurrency,
    date,
  }: { linkToken: string; foreignCurrency: string; date: string }
): Promise<
  { ok: true; answer: RateAnswer } | { ok: false; reason: RateLookupRefusal }
> {
  const groupCurrency = await readGroupCurrency(db, linkToken);
  if (groupCurrency === undefined) return refuse("group-unknown");
  const currency = checkForeignCurrency(foreignCurrency, groupCurrency);
  if (typeof currency === "string") return refuse(currency);
  if (!isCalendarDate(date)) return refuse("date-unreadable");

  const at = now();
  const key = and(
    eq(rateLookups.foreignCurrency, foreignCurrency),
    eq(rateLookups.groupCurrency, groupCurrency),
    eq(rateLookups.date, date)
  );
  const [kept] = await db
    .select()
    .from(rateLookups)
    .where(
      and(key, or(isNull(rateLookups.expiresAt), gt(rateLookups.expiresAt, at)))
    )
    .limit(1);
  if (kept) {
    return {
      ok: true,
      answer:
        kept.answer === "found" && kept.rate && kept.rateDate
          ? { kind: "found", rate: kept.rate, date: kept.rateDate }
          : { kind: "unavailable" },
    };
  }

  // No rate is published ahead of today: a later date gets the latest, and
  // is judged stale against today, not against the entry's date.
  const today = at.toISOString().slice(0, 10);
  const asked = date > today ? today : date;
  const answer = await askSource(source, foreignCurrency, groupCurrency, asked);
  if (answer.kind === "temporary-failure") return { ok: true, answer };

  // A rate published for the past date asked is final. Anything else may
  // move: today's and later rates, an earlier day's rate standing in for a
  // past date whose own isn't published yet, and a pair the source may add.
  const expiresAt =
    answer.kind === "found" && answer.date === date && date < today
      ? null
      : new Date(at.getTime() + KEEP_FOR_MS);
  const row = {
    answer: answer.kind,
    rate: answer.kind === "found" ? answer.rate : null,
    rateDate: answer.kind === "found" ? answer.date : null,
    expiresAt,
  };
  await db
    .insert(rateLookups)
    .values({ foreignCurrency, groupCurrency, date, ...row })
    .onConflictDoUpdate({
      target: [
        rateLookups.foreignCurrency,
        rateLookups.groupCurrency,
        rateLookups.date,
      ],
      set: row,
    });
  return { ok: true, answer };
}

/**
 * The latest rate the source published in the 30 days up to `asked`, from
 * Frankfurter v2's range query. Frankfurter's base is the foreign currency
 * and its quote the group currency, so its rate is the exchange rate as the
 * glossary defines it. Its status decides coverage: 404 and 422 mean it has
 * nothing for this pair or date, which no retry changes.
 */
async function askSource(
  source: RateSource,
  foreignCurrency: string,
  groupCurrency: string,
  asked: string
): Promise<RateAnswer> {
  const from = addDays(asked, -STALE_AFTER_DAYS);
  const query = new URLSearchParams({
    from,
    to: asked,
    base: foreignCurrency,
    quotes: groupCurrency,
  });
  let status: number;
  let body: string;
  try {
    // The timeout covers reading the body too.
    const response = await source.fetch(`${source.url}/rates?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    body = await response.text();
  } catch {
    return { kind: "temporary-failure" };
  }
  if (status === 404 || status === 422) return { kind: "unavailable" };
  if (status !== 200) return { kind: "temporary-failure" };

  const rows = readRows(body);
  if (!rows) return { kind: "temporary-failure" };
  const fresh = rows.filter((row) => row.date >= from && row.date <= asked);
  if (fresh.length === 0) return { kind: "unavailable" };
  const latest = fresh.reduce((a, b) => (b.date > a.date ? b : a));
  return { kind: "found", rate: latest.rate, date: latest.date };
}

/**
 * Frankfurter's range answer, `[{ "date": "2026-11-10", "rate": 1.0463, … }]`,
 * with each rate as a plain decimal string more than zero; undefined for
 * anything else. Rates are JSON numbers, so they are read from their text,
 * never through a float.
 */
function readRows(body: string): { date: string; rate: string }[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      body,
      // Node 24 passes each value's source text; TypeScript's types predate it.
      (_key: string, value: unknown, context?: { source: string }) =>
        typeof value === "number" ? { number: context?.source } : value
    );
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const rows: { date: string; rate: string }[] = [];
  for (const row of parsed) {
    const date = row?.date;
    const rate = plainDecimal(row?.rate?.number);
    if (typeof date !== "string" || !isCalendarDate(date) || !rate) {
      return undefined;
    }
    rows.push({ date, rate });
  }
  return rows;
}

/**
 * A JSON number's text as a plain decimal string more than zero: "1.0463"
 * stays, "1.96e-7" becomes "0.000000196". Undefined for anything else.
 */
function plainDecimal(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return undefined;
  const [, whole, fraction = "", exponent] = match;
  if (!/[1-9]/.test(whole + fraction)) return undefined;
  if (exponent === undefined) return text;
  const digits = whole + fraction;
  // The decimal point sits `point` digits into `digits`.
  const point = whole.length + Number(exponent);
  const padded =
    point <= 0 ? "0".repeat(1 - point) + digits : digits.padEnd(point, "0");
  const at = Math.max(point, 1);
  const integer = padded.slice(0, at).replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(at);
  const trimmed = decimals.replace(/0+$/, "");
  return trimmed === "" ? integer : `${integer}.${trimmed}`;
}

/** YYYY-MM-DD `days` calendar days after `date` (before, when negative). */
function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function refuse(reason: RateLookupRefusal): {
  ok: false;
  reason: RateLookupRefusal;
} {
  return { ok: false, reason };
}
