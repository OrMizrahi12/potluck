import { ISO_4217 } from "./iso-4217";

export type Currency = { code: string; name: string; digits: number };

/**
 * The currencies a group can use: every ISO 4217 currency except the 13 whose
 * minor unit is "N.A." (precious metals, fund units, test codes). `digits` is
 * ISO's minor unit, never the browser's.
 */
export const CURRENCIES: readonly Currency[] = ISO_4217.flatMap(
  ({ code, name, minorUnit }) =>
    minorUnit === null ? [] : [{ code, name, digits: minorUnit }]
);

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function findCurrency(code: string): Currency | undefined {
  return byCode.get(code);
}
