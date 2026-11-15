import { describe, expect, it } from "vitest";
import {
  convertForward,
  formatRate,
  rateFromBankAmount,
} from "./foreign-amount";

describe("converting a foreign amount forward", () => {
  // CHF 48.00 × 1.0463 = 50.2224 EUR, which is €50.22 to the cent.
  it("gives the group-currency amount in minor units", () => {
    expect(convertForward({ amount: 4800, digits: 2 }, "1.0463", 2)).toBe(5022);
  });

  // CHF 10.00 × 1.0005 = 10.005 EUR: exactly half a cent, so it rounds up.
  it("rounds half a minor unit up", () => {
    expect(convertForward({ amount: 1000, digits: 2 }, "1.0005", 2)).toBe(1001);
  });

  // CHF 10.00 × 1.0004 = 10.004 EUR: under half a cent, so it rounds down.
  it("rounds less than half a minor unit down", () => {
    expect(convertForward({ amount: 1000, digits: 2 }, "1.0004", 2)).toBe(1000);
  });

  // ¥1500 × 0.006125 = 9.1875 EUR, which is €9.19 to the cent.
  it("converts from a currency without minor units", () => {
    expect(convertForward({ amount: 1500, digits: 0 }, "0.006125", 2)).toBe(
      919
    );
  });

  // $48.60 × 151.235 = 7350.021 JPY, which is ¥7350.
  it("converts into a currency without minor units", () => {
    expect(convertForward({ amount: 4860, digits: 2 }, "151.235", 0)).toBe(
      7350
    );
  });

  // €12.34 × 0.3765 = 4.64601 KWD, which is 4.646 KWD to the fils.
  it("converts into a currency with three minor-unit digits", () => {
    expect(convertForward({ amount: 1234, digits: 2 }, "0.3765", 3)).toBe(4646);
  });

  // 1.005 KWD × 3.25 = 3.26625 EUR, which is €3.27 to the cent.
  it("converts from a currency with three minor-unit digits", () => {
    expect(convertForward({ amount: 1005, digits: 3 }, "3.25", 2)).toBe(327);
  });

  // ¥2 × 0.0025 = 0.005 EUR: half a cent, so it rounds up to €0.01.
  it("rounds half a minor unit up from a currency without minor units", () => {
    expect(convertForward({ amount: 2, digits: 0 }, "0.0025", 2)).toBe(1);
  });

  // ¥1 × 0.0049 = 0.0049 EUR: under half a cent, so it converts to nothing.
  it("can convert to less than one minor unit", () => {
    expect(convertForward({ amount: 1, digits: 0 }, "0.0049", 2)).toBe(0);
  });
});

describe("a rate worked out from a bank amount", () => {
  // €45.00 ÷ $48.60 = 0.925925925925…, which is 0.9259259259 to 10
  // significant digits.
  it("is the bank amount over the foreign amount, to 10 significant digits", () => {
    expect(
      rateFromBankAmount(
        { amount: 4860, digits: 2 },
        { amount: 4500, digits: 2 }
      )
    ).toBe("0.9259259259");
  });

  // €9.19 ÷ ¥1500 = 0.006126666666…, which is 0.006126666667 to 10
  // significant digits: the 11th digit is a 6, so the 10th rounds up.
  it("rounds the 10th significant digit half up", () => {
    expect(
      rateFromBankAmount(
        { amount: 1500, digits: 0 },
        { amount: 919, digits: 2 }
      )
    ).toBe("0.006126666667");
  });

  // 4.646 KWD ÷ €12.34 = 0.376499189627…, which is 0.3764991896.
  it("works across currencies with different minor-unit digits", () => {
    expect(
      rateFromBankAmount(
        { amount: 1234, digits: 2 },
        { amount: 4646, digits: 3 }
      )
    ).toBe("0.3764991896");
  });

  // €20.00 ÷ CHF 10.00 = 2 exactly: no trailing zeros.
  it("drops trailing zeros", () => {
    expect(
      rateFromBankAmount(
        { amount: 1000, digits: 2 },
        { amount: 2000, digits: 2 }
      )
    ).toBe("2");
  });
});

describe("a rate shown to a member", () => {
  it("keeps a rate of 6 significant digits or fewer as it is", () => {
    expect(formatRate("1.0463")).toBe("1.0463");
    expect(formatRate("2")).toBe("2");
  });

  // 0.9259259259 to 6 significant digits: 0.925925|9259 rounds up to 0.925926.
  it("rounds to 6 significant digits, half up", () => {
    expect(formatRate("0.9259259259")).toBe("0.925926");
    expect(formatRate("151.2345")).toBe("151.235");
    expect(formatRate("0.006126666667")).toBe("0.00612667");
  });

  // 151.2344999 to 6 significant digits: 151.234|4999 rounds down.
  it("rounds under half down", () => {
    expect(formatRate("151.2344999")).toBe("151.234");
  });

  // 0.9999995 to 6 significant digits rounds up to 1.00000, shown as 1.
  it("drops trailing zeros, including after rounding carries over", () => {
    expect(formatRate("0.9999995")).toBe("1");
    expect(formatRate("1.50")).toBe("1.5");
  });

  // 1234567.89 to 6 significant digits is 1234570.
  it("keeps the whole digits of a large rate", () => {
    expect(formatRate("1234567.89")).toBe("1234570");
  });
});
