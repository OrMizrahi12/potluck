import { minorToDecimal } from "./amount";

/**
 * An amount in minor units, formatted for `locale` with exactly the ISO 4217
 * number of decimals. The formatter always gets explicit fraction digits:
 * browsers' CLDR data disagrees with ISO for some currencies (HUF, IQD…).
 * The amount reaches it as a decimal string, never as a float.
 */
export function formatAmount(
  minor: number,
  { currency, digits }: { currency: string; digits: number },
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToDecimal(minor, digits) as Intl.StringNumericLiteral);
}

/** A YYYY-MM-DD date for `locale`, as the calendar date it names. */
export function formatDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
