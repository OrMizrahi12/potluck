// Converting a foreign amount into the group currency, shared by the expense
// form and the group service so both work out identical figures. Amounts are
// integers in minor units and exchange rates are decimal strings: the
// arithmetic is exact, on BigInt, with no float anywhere.

/** An amount in minor units of a currency with `digits` minor-unit digits. */
export type MinorAmount = { amount: number; digits: number };

/** How many significant digits a rate worked out from a bank amount keeps. */
const STORED_RATE_DIGITS = 10;
/** How many significant digits a rate is shown with. */
const SHOWN_RATE_DIGITS = 6;

/**
 * The foreign amount × the exchange rate, in minor units of a group currency
 * with `groupDigits` minor-unit digits, rounded half up.
 *
 * Preconditions the group service guarantees: `foreign.amount` is a positive
 * integer, and `rate` is a decimal string ("1.0463") of digits with at most one
 * "." and a value more than zero.
 */
export function convertForward(
  foreign: MinorAmount,
  rate: string,
  groupDigits: number
): number {
  const { num, den } = product(foreign, rate, groupDigits);
  return Number(roundHalfUp(num, den));
}

/**
 * The foreign amount a group-currency amount is worth at `rate`: `group` ÷
 * the exchange rate, in minor units of a foreign currency with
 * `foreignDigits` minor-unit digits, rounded half up. A suggested settlement
 * switched to another currency proposes it, keeping the suggested figure.
 *
 * Preconditions: `group.amount` is a positive integer, and `rate` is as
 * convertForward's.
 */
export function convertBackward(
  group: MinorAmount,
  rate: string,
  foreignDigits: number
): number {
  const { units, scale } = readRate(rate);
  return Number(
    roundHalfUp(
      BigInt(group.amount) * 10n ** BigInt(scale + foreignDigits),
      units * 10n ** BigInt(group.digits)
    )
  );
}

/**
 * Whether `amount` (minor units of the group currency) agrees with the foreign
 * amount at `rate`: within 1 minor unit of the half-up conversion, or within
 * 0.5% of the foreign amount × the rate. A rate worked out from a bank amount
 * agrees with that bank amount; a garbled figure doesn't.
 *
 * Preconditions: as convertForward's, and `amount` is a positive integer.
 */
export function agreesWithRate(
  amount: number,
  groupDigits: number,
  foreign: MinorAmount,
  rate: string
): boolean {
  const { num, den } = product(foreign, rate, groupDigits);
  if (Math.abs(amount - Number(roundHalfUp(num, den))) <= 1) return true;
  // |amount − num/den| ≤ 0.005 × num/den, in integers.
  const gap = BigInt(amount) * den - num;
  return (gap < 0n ? -gap : gap) * 1000n <= num * 5n;
}

/**
 * The exchange rate that turns `foreign` into exactly `bank`, the amount a
 * bank charged in the group currency, to 10 significant digits, rounded half
 * up and with no trailing zeros.
 *
 * Preconditions: both amounts are positive integers.
 */
export function rateFromBankAmount(
  foreign: MinorAmount,
  bank: MinorAmount
): string {
  return significant(
    BigInt(bank.amount) * 10n ** BigInt(foreign.digits),
    BigInt(foreign.amount) * 10n ** BigInt(bank.digits),
    STORED_RATE_DIGITS
  );
}

/**
 * An exchange rate as a member sees it: 6 significant digits, rounded half
 * up, with no trailing zeros ("0.925926", "1.0463").
 *
 * Precondition: `rate` is a decimal string of digits with at most one "." and
 * a value more than zero.
 */
export function formatRate(rate: string): string {
  const { units, scale } = readRate(rate);
  return significant(units, 10n ** BigInt(scale), SHOWN_RATE_DIGITS);
}

/** foreign × rate in group minor units, as the fraction num / den. */
function product(foreign: MinorAmount, rate: string, groupDigits: number) {
  const { units, scale } = readRate(rate);
  return {
    num: BigInt(foreign.amount) * units * 10n ** BigInt(groupDigits),
    den: 10n ** BigInt(foreign.digits + scale),
  };
}

/** "1.0463" as 10463 units of 10^-4. */
function readRate(rate: string): { units: bigint; scale: number } {
  const [whole, fraction = ""] = rate.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

/** num / den rounded half up, for positive num and den. */
function roundHalfUp(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}

/**
 * num / den as a decimal string with `digits` significant digits, rounded
 * half up, with no trailing zeros. For positive num and den.
 */
function significant(num: bigint, den: bigint, digits: number): string {
  // Find the power of ten k that puts num / den × 10^k in
  // [10^(digits-1), 10^digits), so rounding it to an integer keeps `digits`.
  let k = digits - (String(num).length - String(den).length) - 1;
  const scaled = (power: number) =>
    power >= 0
      ? { num: num * 10n ** BigInt(power), den }
      : { num, den: den * 10n ** BigInt(-power) };
  const low = 10n ** BigInt(digits - 1);
  while (scaled(k).num < low * scaled(k).den) k++;
  while (scaled(k).num >= low * 10n * scaled(k).den) k--;

  let m = roundHalfUp(scaled(k).num, scaled(k).den);
  // Rounding 9.999995 up to 10.0000 adds a digit: drop one.
  if (m === low * 10n) {
    m /= 10n;
    k--;
  }
  return shift(m, k);
}

/** m × 10^-k as a plain decimal string with no trailing zeros. */
function shift(m: bigint, k: number): string {
  if (k <= 0) return String(m) + "0".repeat(-k);
  const text = String(m).padStart(k + 1, "0");
  const whole = text.slice(0, -k);
  const fraction = text.slice(-k).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}
