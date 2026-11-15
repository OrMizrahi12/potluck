"use client";

// PROTOTYPE, throw away. Three structurally different amount blocks, each
// replacing the form's "Amount (CHF)" field. They share state (use-conversion)
// and differ in what they show and which affordance leads.

import { useState } from "react";
import {
  CurrencySelect,
  LookupMessage,
  RateDate,
  SourceNote,
  moneyText,
  needsTyping,
  rateLine,
} from "./parts";
import type { Conversion, Variant } from "./use-conversion";

type Props = {
  conv: Conversion;
  date: string;
  entry: "expense" | "settlement";
};

function placeholder(digits: number) {
  return digits === 0 ? "0" : `0.${"0".repeat(digits)}`;
}

function AmountInput({ conv, label }: { conv: Conversion; label?: string }) {
  return (
    <input
      aria-label={label}
      required
      inputMode={conv.fd === 0 ? "numeric" : "decimal"}
      placeholder={placeholder(conv.fd)}
      autoComplete="off"
      value={conv.amountText}
      onChange={(e) => conv.setAmount(e.target.value)}
    />
  );
}

function RateInput({ conv }: { conv: Conversion }) {
  return (
    <input
      aria-label="Exchange rate"
      inputMode="decimal"
      autoComplete="off"
      placeholder={conv.lookup.status === "looking" ? "looking up…" : ""}
      value={conv.rateText}
      onChange={(e) => conv.setRate(e.target.value)}
    />
  );
}

function GroupInput({ conv }: { conv: Conversion }) {
  return (
    <input
      aria-label={`Amount in ${conv.groupCurrency}`}
      inputMode={conv.gd === 0 ? "numeric" : "decimal"}
      autoComplete="off"
      placeholder={
        conv.lookup.status === "looking" ? "looking up…" : placeholder(conv.gd)
      }
      value={conv.groupText}
      onChange={(e) => conv.setGroup(e.target.value)}
    />
  );
}

/* ------------------------------------------------------------------ A --- */
/** A: one amount field with a currency beside it; the conversion is a quiet
 *  line under it, and the override fields stay folded away until needed. */
function VariantA({ conv, date }: Props) {
  const [open, setOpen] = useState(false);
  const typed = conv.source === "typed-rate" || conv.source === "typed-bank";
  const showOverrides = open || typed || needsTyping(conv);

  return (
    <div className="stack">
      <div className="field">
        <span>Amount</span>
        <div className="row">
          <AmountInput conv={conv} label="Amount" />
          <CurrencySelect conv={conv} date={date} compact />
        </div>
      </div>

      {conv.foreign && (
        <>
          {conv.lookup.status === "looking" && !typed ? (
            <LookupMessage conv={conv} date={date} />
          ) : (
            conv.groupText && (
              <p className="muted" style={{ margin: 0 }}>
                <strong>
                  = {moneyText(conv.groupText, conv.groupCurrency, conv.gd)}
                </strong>{" "}
                · {rateLine(conv)}
                {!typed && (
                  <>
                    {" "}
                    · <SourceNote conv={conv} date={date} />
                  </>
                )}
                {typed && " · typed"}
              </p>
            )
          )}
          {conv.lookup.status !== "looking" && (
            <LookupMessage conv={conv} date={date} />
          )}

          {!showOverrides && (
            <button
              type="button"
              className="secondary"
              style={{ alignSelf: "flex-start" }}
              onClick={() => setOpen(true)}
            >
              {conv.lookup.status === "looking"
                ? "Type the rate instead"
                : "Use another rate or my bank's amount"}
            </button>
          )}

          {showOverrides && (
            <div
              className="stack"
              style={{
                paddingLeft: "0.75rem",
                borderLeft:
                  "3px solid color-mix(in srgb, currentColor 20%, transparent)",
              }}
            >
              <label className="field">
                <span>
                  Exchange rate (1 {conv.currency} = ? {conv.groupCurrency})
                </span>
                <RateInput conv={conv} />
              </label>
              <label className="field">
                <span>Or what your bank charged ({conv.groupCurrency})</span>
                <GroupInput conv={conv} />
              </label>
              {typed && conv.lookup.status !== "permanent" && (
                <button
                  type="button"
                  className="secondary"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => {
                    setOpen(false);
                    conv.backToProposed(date);
                  }}
                >
                  Use Frankfurter&apos;s rate
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ B --- */
/** B: once a foreign currency is picked, a box with the rate and the
 *  group-currency amount side by side, both always editable. No folding. */
function VariantB({ conv, date, entry }: Props) {
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1 }}>
          <span>
            {conv.foreign
              ? `Amount paid (${conv.currency})`
              : `Amount (${conv.groupCurrency})`}
          </span>
          <AmountInput conv={conv} />
        </label>
        <label className="field" style={{ flex: "0 0 7.5rem" }}>
          <span>Paid in</span>
          <CurrencySelect conv={conv} date={date} compact label="Paid in" />
        </label>
      </div>

      {conv.foreign && (
        <fieldset
          className="stack"
          style={{
            padding: "0.75rem",
            border:
              "1px solid color-mix(in srgb, currentColor 25%, transparent)",
            borderRadius: "0.25rem",
          }}
        >
          <legend style={{ padding: "0 0.25rem" }}>
            Counts in the group as
          </legend>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>
                1 {conv.currency} = ? {conv.groupCurrency}
              </span>
              <RateInput conv={conv} />
            </label>
            <span style={{ paddingBottom: "0.6rem" }}>→</span>
            <label className="field" style={{ flex: 1 }}>
              <span>
                {conv.groupCurrency}{" "}
                {entry === "expense" ? "(what your bank charged)" : ""}
              </span>
              <GroupInput conv={conv} />
            </label>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {conv.source === "typed-rate" && "Rate typed by you."}
            {conv.source === "typed-bank" &&
              `Rate worked out from the ${conv.groupCurrency} amount.`}
            {(conv.source === "proposed" || conv.source === "saved") && (
              <SourceNote conv={conv} date={date} />
            )}
            {(conv.source === "typed-rate" || conv.source === "typed-bank") &&
              conv.lookup.status === "ok" && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => conv.backToProposed(date)}
                  >
                    Use Frankfurter&apos;s {formatShort(conv.lookup.rate)}
                  </button>
                </>
              )}
          </p>
          <LookupMessage conv={conv} date={date} />
        </fieldset>
      )}
    </div>
  );
}

function formatShort(rate: number) {
  return String(Number(rate.toPrecision(6)));
}

/* ------------------------------------------------------------------ C --- */
/** C: the currency is the first question; then the person picks how the
 *  amount counts in the group, as one of three explicit choices. */
function VariantC({ conv, date }: Props) {
  const choice = conv.source === "saved" ? "proposed" : (conv.source as string);
  const lookedUp = conv.lookup.status === "ok" || conv.source === "saved";
  return (
    <div className="stack">
      <fieldset className="stack">
        <legend>Paid in</legend>
        <label className="check">
          <input
            type="radio"
            name="proto-paid-in"
            checked={!conv.foreign}
            onChange={() => conv.setCurrency(conv.groupCurrency, date)}
          />
          <span>{conv.groupCurrency}, the group currency</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="proto-paid-in"
            checked={conv.foreign}
            onChange={() =>
              conv.setCurrency(
                conv.groupCurrency === "EUR" ? "USD" : "EUR",
                date
              )
            }
          />
          <span>Another currency</span>
        </label>
        {conv.foreign && <CurrencySelect conv={conv} date={date} />}
      </fieldset>

      <label className="field">
        <span>
          Amount{conv.foreign ? " paid" : ""} ({conv.currency})
        </span>
        <AmountInput conv={conv} />
      </label>

      {conv.foreign && (
        <fieldset className="stack">
          <legend>Counts in the group as</legend>

          <label className="check" style={{ alignItems: "flex-start" }}>
            <input
              type="radio"
              name="proto-counts"
              disabled={!lookedUp}
              checked={choice === "proposed"}
              onChange={() => conv.backToProposed(date)}
            />
            <span>
              {conv.source === "saved" ? (
                <>
                  <strong>
                    {moneyText(conv.groupText, conv.groupCurrency, conv.gd)}
                  </strong>{" "}
                  at the saved rate, {rateLine(conv)}
                </>
              ) : conv.lookup.status === "ok" ? (
                <>
                  <strong>
                    {choice === "proposed"
                      ? moneyText(conv.groupText, conv.groupCurrency, conv.gd)
                      : "—"}
                  </strong>{" "}
                  at Frankfurter&apos;s rate, 1 {conv.currency} ={" "}
                  {formatShort(conv.lookup.rate)} {conv.groupCurrency}
                  <span className="muted">
                    <RateDate conv={conv} date={date} />
                  </span>
                </>
              ) : (
                <>
                  Frankfurter&apos;s rate
                  <LookupMessage conv={conv} date={date} />
                </>
              )}
            </span>
          </label>

          <label className="check" style={{ alignItems: "flex-start" }}>
            <input
              type="radio"
              name="proto-counts"
              checked={choice === "typed-rate"}
              onChange={() => conv.setRate(conv.rateText)}
            />
            <span className="stack" style={{ gap: "0.25rem", flex: 1 }}>
              <span>A rate I type</span>
              {choice === "typed-rate" && (
                <span className="row">
                  1 {conv.currency} = <RateInput conv={conv} />{" "}
                  {conv.groupCurrency}
                </span>
              )}
              {choice === "typed-rate" && conv.groupText && (
                <span className="muted">
                  = {moneyText(conv.groupText, conv.groupCurrency, conv.gd)}
                </span>
              )}
            </span>
          </label>

          <label className="check" style={{ alignItems: "flex-start" }}>
            <input
              type="radio"
              name="proto-counts"
              checked={choice === "typed-bank"}
              onChange={() => conv.setGroup(conv.groupText)}
            />
            <span className="stack" style={{ gap: "0.25rem", flex: 1 }}>
              <span>What my bank charged</span>
              {choice === "typed-bank" && (
                <span className="row">
                  <GroupInput conv={conv} /> {conv.groupCurrency}
                </span>
              )}
              {choice === "typed-bank" && conv.rateText && (
                <span className="muted">{rateLine(conv)}</span>
              )}
            </span>
          </label>
        </fieldset>
      )}
    </div>
  );
}

export function AmountBlock({
  variant,
  ...props
}: Props & { variant: Variant }) {
  switch (variant) {
    case "A":
      return <VariantA {...props} />;
    case "B":
      return <VariantB {...props} />;
    case "C":
      return <VariantC {...props} />;
  }
}
