/**
 * Typed amount text as an integer in minor units, for a currency with `digits`
 * minor-unit digits, or undefined when the text isn't an amount. No floats:
 * the whole and fraction digits are read as integers.
 *
 * Accepts an optional minus sign (so a negative amount can be refused as
 * such), whole digits, and an optional "." or "," followed by at most `digits`
 * fraction digits. No grouping separators. A whole part longer than
 * `maxWholeDigits` (leading zeros aside) is reported as `Infinity`, so a
 * caller can refuse it as too large without the number losing precision.
 */
export function parseAmount(
  text: string,
  digits: number,
  maxWholeDigits = 12
): number | undefined {
  const match = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(text.trim());
  if (!match) return undefined;
  const [, minus, whole, fraction = ""] = match;
  if (whole === "" && fraction === "") return undefined;
  if (fraction.length > digits) return undefined;

  const significantWhole = whole.replace(/^0+/, "");
  if (significantWhole.length > maxWholeDigits) {
    return minus ? -Infinity : Infinity;
  }
  const minor =
    Number(significantWhole || "0") * 10 ** digits +
    Number(fraction.padEnd(digits, "0") || "0");
  return minus ? -minor : minor;
}

/**
 * An amount in minor units as a plain decimal string ("1234" with 2 digits is
 * "12.34"), which Intl.NumberFormat formats exactly, with no float in between.
 */
export function minorToDecimal(minor: number, digits: number): string {
  const sign = minor < 0 ? "-" : "";
  const text = String(Math.abs(minor)).padStart(digits + 1, "0");
  if (digits === 0) return sign + text;
  return `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}
