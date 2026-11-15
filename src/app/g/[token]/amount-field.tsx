"use client";

import { useId, useState } from "react";
import { CURRENCIES, findCurrency } from "@/currency/currencies";
import { minorToDecimal, parseAmount } from "@/money/amount";
import {
  convertForward,
  formatRate,
  rateFromBankAmount,
} from "@/money/foreign-amount";
import { formatAmount } from "@/money/format";

/** An entry's foreign part as the edit page hands it over: typed text. */
export type InitialForeignPart = {
  amount: string;
  currency: string;
  rate: string;
};

/**
 * The amount field's state: the number typed, the currency picked beside it,
 * and, for a foreign amount, the two linked fields (exchange rate, bank
 * amount). A bank amount, once typed, stays fixed and the rate is worked out
 * from it; otherwise the rate stays fixed and the group-currency amount is
 * worked out. Everything is recalculated here in the browser, with the same
 * pure module the group service checks against.
 */
export function useAmountField({
  currency,
  digits,
  initialAmount = "",
  initialForeign,
}: {
  currency: string;
  digits: number;
  initialAmount?: string;
  initialForeign?: InitialForeignPart;
}) {
  const [paidIn, setPaidIn] = useState(initialForeign?.currency ?? currency);
  const [typed, setTyped] = useState(initialForeign?.amount ?? initialAmount);
  const [rateText, setRateText] = useState(initialForeign?.rate ?? "");
  const [bankText, setBankText] = useState("");
  const [bankTyped, setBankTyped] = useState(false);
  // Where the rate came from: the saved entry's, or typed on this page.
  const [source, setSource] = useState<"saved" | "typed">(
    initialForeign ? "saved" : "typed"
  );

  const foreignCurrency =
    paidIn === currency ? undefined : findCurrency(paidIn);
  let rate: string | undefined;
  let groupAmount: number | undefined;
  if (foreignCurrency) {
    const foreignMinor = positive(parseAmount(typed, foreignCurrency.digits));
    const foreign = foreignMinor && {
      amount: foreignMinor,
      digits: foreignCurrency.digits,
    };
    if (bankTyped) {
      const bankMinor = positive(parseAmount(bankText, digits));
      if (foreign && bankMinor) {
        rate = rateFromBankAmount(foreign, { amount: bankMinor, digits });
        groupAmount = bankMinor;
      }
    } else {
      rate = readRate(rateText);
      if (foreign && rate) groupAmount = convertForward(foreign, rate, digits);
    }
  }

  return {
    currency,
    digits,
    paidIn,
    typed,
    foreignCurrency,
    /** The rate the entry will be saved at, once there is one. */
    rate,
    /** The group-currency amount in minor units, once it can be worked out. */
    groupAmount,
    source,
    /** What the exchange rate field shows: a rate worked out from a bank amount is shown rounded. */
    rateField: bankTyped ? (rate ? formatRate(rate) : "") : rateText,
    /** What the bank amount field shows: worked out from the rate until one is typed. */
    bankField:
      bankTyped || groupAmount === undefined
        ? bankText
        : minorToDecimal(groupAmount, digits),
    pickCurrency(code: string) {
      setPaidIn(code);
      // A rate belongs to one pair of currencies: a new pick starts afresh.
      setRateText("");
      setBankText("");
      setBankTyped(false);
      setSource("typed");
    },
    type: setTyped,
    typeRate(text: string) {
      setRateText(text);
      setBankTyped(false);
      setSource("typed");
    },
    typeBank(text: string) {
      setBankText(text);
      setBankTyped(true);
      setSource("typed");
    },
  };
}

export type AmountFieldState = ReturnType<typeof useAmountField>;

/**
 * One amount field with a currency picker beside it, defaulting to the group
 * currency. Another currency opens the exchange rate and bank amount fields
 * and the quiet line saying what the entry will count as. What the form
 * sends: `amount` in the group currency and, for a foreign amount,
 * `foreignAmount`, `foreignCurrency` and `exchangeRate`.
 */
export function AmountField({
  field,
  locale,
  problem,
}: {
  field: AmountFieldState;
  locale: string;
  /** Why the converted figure can't be recorded, shown before saving. */
  problem?: string;
}) {
  const id = useId();
  const { currency, digits, foreignCurrency, rate, groupAmount } = field;
  const typedDigits = foreignCurrency?.digits ?? digits;

  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Amount ({field.paidIn})</label>
        <div className="row amount-row">
          <input
            id={`${id}-amount`}
            name={foreignCurrency ? "foreignAmount" : "amount"}
            required
            inputMode={typedDigits === 0 ? "numeric" : "decimal"}
            placeholder={
              typedDigits === 0 ? "0" : `0.${"0".repeat(typedDigits)}`
            }
            autoComplete="off"
            value={field.typed}
            onChange={(e) => field.type(e.target.value)}
          />
          <select
            aria-label="Currency"
            className="currency-picker"
            value={field.paidIn}
            onChange={(e) => field.pickCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {foreignCurrency && (
        <>
          <input
            type="hidden"
            name="foreignCurrency"
            value={foreignCurrency.code}
          />
          <input type="hidden" name="exchangeRate" value={rate ?? ""} />
          <input
            type="hidden"
            name="amount"
            value={
              groupAmount === undefined
                ? ""
                : minorToDecimal(groupAmount, digits)
            }
          />
          {rate && groupAmount !== undefined && (
            <p className="muted quiet-line">
              = {formatAmount(groupAmount, { currency, digits }, locale)} · 1{" "}
              {foreignCurrency.code} = {formatRate(rate)} {currency} ·{" "}
              {field.source === "saved" ? "saved rate" : "typed"}
            </p>
          )}
          <p role="status" className="error">
            {problem}
          </p>
          <label className="field">
            <span>
              Exchange rate (1 {foreignCurrency.code} = ? {currency})
            </span>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={field.rateField}
              onChange={(e) => field.typeRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Or what your bank charged ({currency})</span>
            <input
              inputMode={digits === 0 ? "numeric" : "decimal"}
              placeholder={digits === 0 ? "0" : `0.${"0".repeat(digits)}`}
              autoComplete="off"
              value={field.bankField}
              onChange={(e) => field.typeBank(e.target.value)}
            />
          </label>
        </>
      )}
    </>
  );
}

/** A minor-unit amount when it's a positive finite one, else undefined. */
function positive(minor: number | undefined): number | undefined {
  return minor !== undefined && minor > 0 && Number.isFinite(minor)
    ? minor
    : undefined;
}

/**
 * A typed rate as the plain decimal string the conversion takes ("1,0463" is
 * "1.0463"), or undefined unless it's a number more than zero.
 */
function readRate(text: string): string | undefined {
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(text.trim());
  if (!match) return undefined;
  const [, whole, fraction = ""] = match;
  if (!/[1-9]/.test(whole + fraction)) return undefined;
  const plainWhole = whole.replace(/^0+/, "") || "0";
  return fraction === "" ? plainWhole : `${plainWhole}.${fraction}`;
}
