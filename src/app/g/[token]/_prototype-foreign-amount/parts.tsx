"use client";

// PROTOTYPE, throw away. Pieces the variants share: the currency picker, the
// lookup messages (wording from "When a rate can't be looked up"), and the
// panel that surfaces what would be stored.

import { CURRENCIES } from "@/currency/currencies";
import { formatAmount, formatDate } from "@/money/format";
import { parseAmount } from "@/money/amount";
import type { Conversion } from "./use-conversion";

export const LOCALE = "en";

export function money(minor: number, currency: string, digits: number) {
  return formatAmount(minor, { currency, digits }, LOCALE);
}

export function moneyText(text: string, currency: string, digits: number) {
  const m = parseAmount(text, digits);
  return m === undefined || !Number.isFinite(m)
    ? "—"
    : money(m, currency, digits);
}

export function CurrencySelect({
  conv,
  date,
  label = "Currency",
  compact = false,
}: {
  conv: Conversion;
  date: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={conv.currency}
      onChange={(e) => conv.setCurrency(e.target.value, date)}
      style={compact ? { width: "auto", flex: "0 0 auto" } : undefined}
    >
      <option value={conv.groupCurrency}>
        {conv.groupCurrency}
        {compact ? "" : " (group currency)"}
      </option>
      {CURRENCIES.filter((c) => c.code !== conv.groupCurrency).map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
          {compact ? "" : ` · ${c.name}`}
        </option>
      ))}
    </select>
  );
}

/** "1 EUR = 0.941204 CHF" */
export function rateLine(conv: Conversion): string {
  return `1 ${conv.currency} = ${conv.rateText || "?"} ${conv.groupCurrency}`;
}

/** The rate's own date, only when it isn't the entry's. */
export function RateDate({ conv, date }: { conv: Conversion; date: string }) {
  if (conv.lookup.status !== "ok" || conv.lookup.rateDate === date) return null;
  return <> · rate of {formatDate(conv.lookup.rateDate, LOCALE)}</>;
}

export function SourceNote({ conv, date }: { conv: Conversion; date: string }) {
  if (conv.source === "saved") return <>rate saved with this entry</>;
  if (conv.source !== "proposed" || conv.lookup.status !== "ok") return null;
  return (
    <>
      rate from Frankfurter
      <RateDate conv={conv} date={date} />
    </>
  );
}

/** Looking up, or one of the two failures. Null when there's nothing to say. */
export function LookupMessage({
  conv,
  date,
}: {
  conv: Conversion;
  date: string;
}) {
  const typed = conv.source === "typed-rate" || conv.source === "typed-bank";
  switch (conv.lookup.status) {
    case "looking":
      return (
        <p className="muted" role="status">
          Looking up the {conv.currency} rate…
          {!typed && " You can type it instead."}
        </p>
      );
    case "temporary":
      return (
        <p className="error" role="status">
          Couldn&apos;t get a rate right now.{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => conv.retry(date)}
          >
            Try again
          </button>
          {!typed && (
            <>
              <br />
              Or type the rate, or what your bank charged in{" "}
              {conv.groupCurrency}.
            </>
          )}
        </p>
      );
    case "permanent":
      return (
        <p className="error" role="status">
          No rate available for {conv.currency} on this date.
          {!typed && (
            <>
              {" "}
              Type the rate, or what your bank charged in {conv.groupCurrency}.
            </>
          )}
        </p>
      );
    default:
      return null;
  }
}

/** True when a lookup failed and nothing has been typed yet. */
export function needsTyping(conv: Conversion): boolean {
  return (
    (conv.lookup.status === "temporary" ||
      conv.lookup.status === "permanent") &&
    conv.source === "proposed"
  );
}

/** Rule 5 of the prototype: show what saving would store. Not a design. */
export function StoredPanel({ conv }: { conv: Conversion }) {
  return (
    <aside
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: "0.8rem",
        padding: "0.5rem 0.75rem",
        border: "1px dashed #b26a00",
        borderRadius: "0.25rem",
        color: "#b26a00",
      }}
    >
      <strong>Prototype · would store</strong>
      <br />
      {conv.foreign ? (
        <>
          foreign amount: {conv.amountText || "—"} {conv.currency}
          <br />
          group-currency amount: {conv.groupText || "—"} {conv.groupCurrency}
          <br />
          exchange rate: {conv.rateText || "—"}
          <br />
          (rate came from: {conv.source}; lookup: {conv.lookup.status})
        </>
      ) : (
        <>
          amount: {conv.amountText || "—"} {conv.groupCurrency} (no foreign
          amount)
        </>
      )}
      <br />
      Saving is switched off in the prototype.
    </aside>
  );
}
