// PROTOTYPE, throw away. Answers "What the expense and settlement forms and
// lists show for a foreign amount" (#50). Nothing here calls Frankfurter: the
// rates are rough fakes so every lookup outcome can be forced from the URL.

/** Rough value of one unit in USD. Anything missing gets a made-up value. */
const USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  CHF: 1.13,
  GBP: 1.27,
  JPY: 0.0066,
  BHD: 2.65,
  ILS: 0.27,
  THB: 0.028,
  HUF: 0.0027,
  SEK: 0.095,
  CAD: 0.73,
  MXN: 0.058,
  KWD: 3.25,
  ISK: 0.0072,
};

/** Codes Frankfurter v2 doesn't cover (see "Where exchange rates can come from"). */
const UNCOVERED = new Set([
  "BOV",
  "CHE",
  "CHW",
  "COU",
  "USN",
  "UYW",
  "XAD",
  "CLF",
  "MXV",
  "VED",
]);

function usdValue(code: string): number {
  if (USD[code]) return USD[code];
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return 0.001 + (h / 9973) * 2;
}

/** Units of `to` one unit of `from` was worth. */
export function fakeRate(from: string, to: string): number {
  return Number((usdValue(from) / usdValue(to)).toPrecision(6));
}

export type Scenario = "ok" | "slow" | "timeout" | "down" | "none" | "older";

export const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: "ok", label: "Rate found" },
  { key: "older", label: "Rate from an earlier day" },
  { key: "slow", label: "Slow (2.5s)" },
  { key: "timeout", label: "Times out (4s)" },
  { key: "down", label: "Source down" },
  { key: "none", label: "No rate for this pair/date" },
];

export type LookupAnswer =
  | { kind: "ok"; rate: number; rateDate: string }
  | { kind: "temporary" }
  | { kind: "permanent" };

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * What the Potluck rate endpoint would answer. "timeout" never answers, so the
 * form's own 4-second limit is what ends it.
 */
export function fakeLookup(
  from: string,
  to: string,
  date: string,
  scenario: Scenario
): Promise<LookupAnswer> {
  const after = (ms: number, a: LookupAnswer) =>
    new Promise<LookupAnswer>((r) => setTimeout(() => r(a), ms));
  if (UNCOVERED.has(from) || UNCOVERED.has(to))
    return after(300, { kind: "permanent" });
  const ok = { kind: "ok" as const, rate: fakeRate(from, to), rateDate: date };
  switch (scenario) {
    case "ok":
      return after(400, ok);
    case "older":
      return after(400, { ...ok, rateDate: daysBefore(date, 2) });
    case "slow":
      return after(2500, ok);
    case "timeout":
      return new Promise(() => {});
    case "down":
      return after(300, { kind: "temporary" });
    case "none":
      return after(300, { kind: "permanent" });
  }
}

/** A foreign currency to pretend a recorded entry was in, for the lists. */
export function pretendForeign(groupCurrency: string): string {
  return groupCurrency === "EUR" ? "USD" : "EUR";
}

const DIGITS: Record<string, number> = { JPY: 0, BHD: 3, KWD: 3, ISK: 0 };

/**
 * An entry recorded in the group currency, pretended to have had a foreign
 * amount: what the lists and the reopened form show. Amounts in minor units.
 */
export function pretendSaved(
  groupCurrency: string,
  groupMinor: number,
  groupDigits: number
) {
  const currency = pretendForeign(groupCurrency);
  const digits = DIGITS[currency] ?? 2;
  const rate = fakeRate(currency, groupCurrency);
  const foreignMinor = Math.round(
    (groupMinor / 10 ** groupDigits / rate) * 10 ** digits
  );
  return { currency, digits, rate, foreignMinor };
}
