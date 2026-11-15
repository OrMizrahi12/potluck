// Checks the group service and the rate lookup both make on what a form
// sends, so the two refuse the same input for the same reason.
import { findCurrency, type Currency } from "../currency/currencies";

/** Whether text is a real calendar date written YYYY-MM-DD. */
export function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * The picker's currency with `code`, for a foreign amount in a group whose
 * currency is `groupCurrency`, or why it can't be one.
 */
export function checkForeignCurrency(
  code: string,
  groupCurrency: string
):
  Currency | "foreign-currency-unknown" | "foreign-currency-is-group-currency" {
  const currency = findCurrency(code);
  if (!currency) return "foreign-currency-unknown";
  if (currency.code === groupCurrency)
    return "foreign-currency-is-group-currency";
  return currency;
}
