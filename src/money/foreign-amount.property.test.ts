import { describe, expect, it } from "vitest";
import { convertForward } from "./foreign-amount";

/** mulberry32: a small seeded generator, so a failure reproduces from SEED. */
function generator(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  return { next, int };
}

/**
 * The reference: foreign × rate in group minor units, half up, by integer
 * division and remainder on BigInt, written out independently of the module.
 */
function reference(
  foreignMinor: number,
  foreignDigits: number,
  rate: string,
  groupDigits: number
): bigint {
  const [whole, fraction = ""] = rate.split(".");
  const exact = BigInt(foreignMinor) * BigInt(whole + fraction);
  // `exact` is in units of 10^-(foreignDigits + fraction digits); the answer
  // is in units of 10^-groupDigits.
  const drop = foreignDigits + fraction.length - groupDigits;
  if (drop <= 0) return exact * 10n ** BigInt(-drop);
  const divisor = 10n ** BigInt(drop);
  const quotient = exact / divisor;
  const remainder = exact % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}

const SEED = 20261115;
const CASES = 20000;
const DIGITS = [0, 2, 3];

describe("converting a foreign amount forward, at random", () => {
  it(`matches exact integer arithmetic to the minor unit (${CASES} cases, seed ${SEED})`, () => {
    const random = generator(SEED);
    for (let i = 0; i < CASES; i++) {
      const foreignDigits = DIGITS[random.int(0, 2)];
      const groupDigits = DIGITS[random.int(0, 2)];
      const foreignMinor = random.int(1, 1_000_000_000);
      const fractionDigits = random.int(0, 10);
      const whole = String(random.int(0, 999));
      const fraction = Array.from({ length: fractionDigits }, () =>
        random.int(0, 9)
      ).join("");
      // A rate more than zero: a zero rate is the service's to refuse.
      const rate =
        fraction === ""
          ? String(Math.max(1, Number(whole)))
          : `${whole}.${fraction.replace(/^0*$/, (zeros) => zeros.slice(1) + "1")}`;

      const converted = convertForward(
        { amount: foreignMinor, digits: foreignDigits },
        rate,
        groupDigits
      );
      expect(
        BigInt(converted),
        `${foreignMinor} (${foreignDigits} digits) × ${rate} → ${groupDigits} digits`
      ).toBe(reference(foreignMinor, foreignDigits, rate, groupDigits));
    }
  });
});
