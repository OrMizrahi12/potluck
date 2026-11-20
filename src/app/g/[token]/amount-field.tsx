"use client";

import { useId, useRef, useState } from "react";
import { CURRENCIES, findCurrency } from "@/currency/currencies";
import { minorToDecimal, parseAmount } from "@/money/amount";
import {
  convertBackward,
  convertForward,
  formatRate,
  rateFromBankAmount,
} from "@/money/foreign-amount";
import { formatAmount, formatDate } from "@/money/format";
import type { RateAnswer } from "@/group/rate-lookup";
import type { ForeignPartRefusal } from "@/group/service";

/** An entry's foreign part as the edit page hands it over: typed text. */
export type InitialForeignPart = {
  amount: string;
  currency: string;
  rate: string;
};

/** Where the rate lookup for the picked currency and the entry's date stands. */
type Lookup = { kind: "none" } | { kind: "looking-up" } | RateAnswer;

/**
 * The amount field's state: the number typed, the currency picked beside it,
 * and, for a foreign amount, the two linked fields (exchange rate, bank
 * amount). A bank amount, once typed, stays fixed and the rate is worked out
 * from it; otherwise the rate stays fixed and the group-currency amount is
 * worked out. Everything is recalculated here in the browser, with the same
 * pure module the group service checks against.
 *
 * Picking a foreign currency, or changing the date through `changeDate`,
 * looks up Frankfurter's rate through Potluck's server and proposes it.
 * Typing a rate or bank amount wins over an answer that comes later. An
 * entry's saved rate is kept on a date change: the new date's rate is only
 * offered beside it, and nothing is offered when the lookup fails.
 *
 * With `suggested`, `initialAmount` is a suggested settlement's figure:
 * switching to another currency keeps it as the group-currency amount and
 * works the foreign amount backwards from it, until an amount or a bank
 * amount is typed.
 */
export function useAmountField({
  token,
  currency,
  digits,
  date,
  initialAmount = "",
  initialForeign,
  suggested = false,
}: {
  token: string;
  currency: string;
  digits: number;
  /** The entry's date, YYYY-MM-DD, as the form shows it now. */
  date: string;
  initialAmount?: string;
  initialForeign?: InitialForeignPart;
  suggested?: boolean;
}) {
  const [paidIn, setPaidIn] = useState(initialForeign?.currency ?? currency);
  const [typed, setTyped] = useState(initialForeign?.amount ?? initialAmount);
  const [rateText, setRateText] = useState(initialForeign?.rate ?? "");
  const [bankText, setBankText] = useState("");
  const [bankTyped, setBankTyped] = useState(false);
  // Where the rate came from: the saved entry's, Frankfurter's, or typed on
  // this page.
  const [source, setSource] = useState<"saved" | "typed" | "looked-up">(
    initialForeign ? "saved" : "typed"
  );
  const [lookup, setLookup] = useState<Lookup>({ kind: "none" });
  const [backwards, setBackwards] = useState(suggested);
  // The exchange rate and bank amount fields, folded away until asked for.
  const [overriding, setOverriding] = useState(false);
  const running = useRef<AbortController | null>(null);
  // Whether a rate or bank amount was typed since the running lookup began.
  const typedSinceAsking = useRef(false);

  /**
   * Asks Potluck's server for the rate of `code` on `onDate` and proposes it,
   * or, to `offer` it beside a saved rate, only keeps a rate found.
   */
  function lookUp(
    code: string,
    onDate: string,
    typedAlready: boolean,
    offer = false
  ) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    typedSinceAsking.current = typedAlready;
    // An offer is quiet: no "looking up" while the saved rate stands.
    setLookup({ kind: offer ? "none" : "looking-up" });
    fetch(`/g/${token}/rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foreignCurrency: code, date: onDate }),
      signal: controller.signal,
    })
      .then((response): Promise<RateAnswer> | RateAnswer =>
        response.ok ? response.json() : { kind: "temporary-failure" }
      )
      .catch((): RateAnswer => ({ kind: "temporary-failure" }))
      .then((answer) => {
        // A later pick or date has asked again since.
        if (controller.signal.aborted) return;
        running.current = null;
        if (offer) {
          if (answer.kind === "found") setLookup(answer);
          return;
        }
        setLookup(answer);
        if (answer.kind !== "found") {
          setOverriding(true);
        } else if (!typedSinceAsking.current) {
          setRateText(answer.rate);
          setBankText("");
          setBankTyped(false);
          setSource("looked-up");
        }
      });
  }

  /** Stops a running lookup and forgets its answer: there's nothing to look up. */
  function stopLooking() {
    running.current?.abort();
    running.current = null;
    setLookup({ kind: "none" });
  }

  const foreignCurrency =
    paidIn === currency ? undefined : findCurrency(paidIn);
  const worked =
    backwards && foreignCurrency
      ? workBackwards(
          initialAmount,
          digits,
          plainTypedRate(rateText),
          foreignCurrency.digits
        )
      : undefined;
  // What the amount field shows: worked backwards once there's a rate.
  const shown = backwards && foreignCurrency ? (worked?.foreign ?? "") : typed;
  let rate: string | undefined;
  let groupAmount: number | undefined;
  if (foreignCurrency) {
    const foreignMinor = positive(parseAmount(shown, foreignCurrency.digits));
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
      rate = plainTypedRate(rateText);
      // A saved entry whose foreign amount, currency and rate are untouched
      // keeps its stored group-currency amount: one saved from a worked-
      // backwards suggestion can be a minor unit off converting forward.
      const conversionUntouched =
        initialForeign !== undefined &&
        paidIn === initialForeign.currency &&
        typed === initialForeign.amount &&
        rateText === initialForeign.rate;
      if (foreign && rate)
        groupAmount =
          (conversionUntouched &&
            positive(parseAmount(initialAmount, digits))) ||
          convertForward(foreign, rate, digits);
    }
    // Converting forward again can be a minor unit off: the suggested
    // figure stays, so saving settles both members up exactly.
    if (worked) groupAmount = worked.group;
  }

  return {
    currency,
    digits,
    paidIn,
    typed: shown,
    foreignCurrency,
    /** The rate the entry will be saved at, once there is one. */
    rate,
    /** The group-currency amount in minor units, once it can be worked out. */
    groupAmount,
    source,
    date,
    lookup,
    /** Whether the exchange rate and bank amount fields are open. */
    overriding,
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
      setOverriding(false);
      if (code === currency) stopLooking();
      else lookUp(code, date, false);
    },
    /** The form calls this when the entry's date changes to `newDate`. */
    changeDate(newDate: string) {
      if (!foreignCurrency) return;
      if (source === "saved") {
        lookUp(foreignCurrency.code, newDate, false, true);
        return;
      }
      // A rate or bank amount typed before the change stays.
      const typed = source === "typed" && (rateText !== "" || bankTyped);
      lookUp(foreignCurrency.code, newDate, typed);
    },
    tryAgain() {
      if (foreignCurrency) lookUp(foreignCurrency.code, date, false);
    },
    openOverride() {
      setOverriding(true);
    },
    /** Goes back to the rate Frankfurter proposed. */
    takeLookedUpRate() {
      if (lookup.kind !== "found") return;
      setRateText(lookup.rate);
      setBankText("");
      setBankTyped(false);
      setSource("looked-up");
      setOverriding(false);
    },
    type(text: string) {
      setBackwards(false);
      setTyped(text);
    },
    typeRate(text: string) {
      typedSinceAsking.current = true;
      setRateText(text);
      setBankTyped(false);
      setSource("typed");
    },
    typeBank(text: string) {
      // The foreign amount worked backwards stays; the bank amount now leads.
      setTyped(shown);
      setBackwards(false);
      typedSinceAsking.current = true;
      setBankText(text);
      setBankTyped(true);
      setSource("typed");
    },
  };
}

export type AmountFieldState = ReturnType<typeof useAmountField>;

/** What a member sees when the amount typed in the field can't be read. */
export function unreadableAmountMessage(field: AmountFieldState): string {
  const typedDigits = field.foreignCurrency?.digits ?? field.digits;
  return typedDigits === 0
    ? `Type the amount as a whole number, like ${example(0)}.`
    : `Type the amount as a number with up to ${typedDigits} decimals, like ${example(typedDigits)}.`;
}

/** An amount as it's typed in a currency with `digits`: "1500", "12.50", "12.500". */
function example(digits: number): string {
  return digits === 0 ? "1500" : `12.${"5".padEnd(digits, "0")}`;
}

/** What a member sees when the group service refuses an entry's foreign part. */
const FOREIGN_PART_MESSAGES: Record<
  ForeignPartRefusal,
  (field: AmountFieldState) => string
> = {
  "foreign-currency-unknown": () => "Pick a currency from the list.",
  "foreign-currency-is-group-currency": () => "Pick a currency from the list.",
  "foreign-amount-unreadable": unreadableAmountMessage,
  "foreign-amount-not-positive": () => "The amount must be more than zero.",
  "foreign-amount-too-large": () =>
    "Type the amount with at most 12 digits before the decimal point.",
  "exchange-rate-unreadable": ({ currency }) =>
    `Type the exchange rate, or what your bank charged in ${currency}.`,
  "exchange-rate-not-positive": () =>
    "The exchange rate must be more than zero.",
};

/** Whether `refusal` is about the entry's foreign part. */
export function isForeignPartRefusal(
  refusal: string
): refusal is ForeignPartRefusal {
  return Object.hasOwn(FOREIGN_PART_MESSAGES, refusal);
}

/** What a member sees when the group service refuses an entry's foreign part. */
export function foreignPartMessage(
  refusal: ForeignPartRefusal,
  field: AmountFieldState
): string {
  return FOREIGN_PART_MESSAGES[refusal](field);
}

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
              {sourceNote(field, locale)}
            </p>
          )}
          {field.source === "saved" && field.lookup.kind === "found" && (
            <p className="muted quiet-line">
              Rate for {formatDate(field.lookup.date, locale)}: 1{" "}
              {foreignCurrency.code} = {formatRate(field.lookup.rate)}{" "}
              {currency} ·{" "}
              <button
                type="button"
                className="link-button"
                onClick={field.takeLookedUpRate}
              >
                Use this rate
              </button>
            </p>
          )}
          <p role="status" className="error">
            {problem}
          </p>
          <LookupNote field={field} code={foreignCurrency.code} />
          {field.overriding ? (
            <>
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
              {field.lookup.kind === "found" &&
                field.source !== "looked-up" && (
                  <button
                    type="button"
                    className="secondary rate-button"
                    onClick={field.takeLookedUpRate}
                  >
                    Use Frankfurter&apos;s rate
                  </button>
                )}
            </>
          ) : (
            field.lookup.kind !== "looking-up" && (
              <button
                type="button"
                className="secondary rate-button"
                onClick={field.openOverride}
              >
                Use another rate or my bank&apos;s amount
              </button>
            )
          )}
        </>
      )}
    </>
  );
}

/** Where the quiet line says the rate came from. */
function sourceNote(field: AmountFieldState, locale: string): string {
  const { source, lookup, date } = field;
  if (source === "saved") return "saved rate";
  if (source === "typed" || lookup.kind !== "found") return "typed";
  // A weekend, a holiday or a later date gets another day's rate: say which.
  return lookup.date === date
    ? "rate from Frankfurter"
    : `rate from Frankfurter · rate of ${formatDate(lookup.date, locale)}`;
}

/** What the lookup is doing, when it's still running or couldn't propose a rate. */
function LookupNote({
  field,
  code,
}: {
  field: AmountFieldState;
  code: string;
}) {
  const { lookup, currency } = field;
  return (
    <div aria-live="polite" className="lookup-note">
      {lookup.kind === "looking-up" && (
        <>
          <p className="muted">
            Looking up the {code} rate… You can type it instead.
          </p>
          {!field.overriding && (
            <button
              type="button"
              className="secondary rate-button"
              onClick={field.openOverride}
            >
              Type the rate instead
            </button>
          )}
        </>
      )}
      {lookup.kind === "temporary-failure" && (
        <>
          <p className="muted">Couldn&apos;t get a rate right now.</p>
          <button
            type="button"
            className="secondary rate-button"
            onClick={field.tryAgain}
          >
            Try again
          </button>
          <p className="muted">
            Or type the rate, or what your bank charged in {currency}.
          </p>
        </>
      )}
      {lookup.kind === "unavailable" && (
        <p className="muted">
          No rate available for {code} on this date. Type the rate, or what your
          bank charged in {currency}.
        </p>
      )}
    </div>
  );
}

/**
 * A suggested settlement's figure (`suggested`, typed in the group currency)
 * in minor units, and the foreign amount worked backwards from it at `rate`,
 * as typed text. Undefined until there's a rate.
 */
function workBackwards(
  suggested: string,
  digits: number,
  rate: string | undefined,
  foreignDigits: number
): { group: number; foreign: string } | undefined {
  const group = positive(parseAmount(suggested, digits));
  if (!group || !rate) return undefined;
  const foreign = convertBackward(
    { amount: group, digits },
    rate,
    foreignDigits
  );
  return { group, foreign: minorToDecimal(foreign, foreignDigits) };
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
function plainTypedRate(text: string): string | undefined {
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(text.trim());
  if (!match) return undefined;
  const [, whole = "", fraction = ""] = match;
  if (!/[1-9]/.test(whole + fraction)) return undefined;
  const plainWhole = whole.replace(/^0+/, "") || "0";
  return fraction === "" ? plainWhole : `${plainWhole}.${fraction}`;
}
