"use client";

// PROTOTYPE, throw away. The form state every variant shares, so the variants
// differ only in what they show. Rules from "How a foreign amount becomes part
// of a balance", "Settlements in another currency" and "When a rate can't be
// looked up".

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { findCurrency } from "@/currency/currencies";
import { minorToDecimal, parseAmount } from "@/money/amount";
import { fakeLookup, type LookupAnswer, type Scenario } from "./fake-rates";
import { VARIANTS, formatRate, type Variant } from "./shared";

export { VARIANTS, VARIANT_NAMES, formatRate, type Variant } from "./shared";

/** `?variant=` and `?rates=`, or undefined when the prototype is off. */
export function usePrototype():
  { variant: Variant; scenario: Scenario } | undefined {
  const params = useSearchParams();
  const v = params.get("variant");
  if (process.env.NODE_ENV === "production") return undefined;
  if (!v || !(VARIANTS as readonly string[]).includes(v)) return undefined;
  return {
    variant: v as Variant,
    scenario: (params.get("rates") as Scenario) ?? "ok",
  };
}

export type Lookup =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "ok"; rate: number; rateDate: string }
  | { status: "temporary" }
  | { status: "permanent" };

/** Where the rate in the form came from. Nothing about this is stored. */
export type Source = "proposed" | "typed-rate" | "typed-bank" | "saved";

type State = {
  currency: string;
  /** The amount field: the foreign amount, or the plain amount in the group currency. */
  amountText: string;
  /** The group-currency amount (the bank amount when typed). */
  groupText: string;
  rateText: string;
  source: Source;
  lookup: Lookup;
  /** A suggested settlement's amount, still untouched: switching currency works backwards from it. */
  suggested: boolean;
  /** Waiting for a rate to work the foreign amount backwards. */
  backwards: boolean;
};

export function digitsOf(code: string): number {
  return findCurrency(code)?.digits ?? 2;
}

function forward(
  amountText: string,
  rate: number,
  fd: number,
  gd: number
): string {
  const f = parseAmount(amountText, fd);
  if (f === undefined || !Number.isFinite(f) || !(rate > 0)) return "";
  // Half-up to the group currency's minor unit (float is fine in a prototype).
  return minorToDecimal(Math.round((f / 10 ** fd) * rate * 10 ** gd), gd);
}

function backward(
  groupText: string,
  rate: number,
  fd: number,
  gd: number
): string {
  const g = parseAmount(groupText, gd);
  if (g === undefined || !Number.isFinite(g) || !(rate > 0)) return "";
  return minorToDecimal(Math.round((g / 10 ** gd / rate) * 10 ** fd), fd);
}

function derivedRate(
  groupText: string,
  amountText: string,
  fd: number,
  gd: number
): string {
  const g = parseAmount(groupText, gd);
  const f = parseAmount(amountText, fd);
  if (!g || !f || !Number.isFinite(g) || !Number.isFinite(f)) return "";
  return formatRate(g / 10 ** gd / (f / 10 ** fd));
}

export type Conversion = ReturnType<typeof useConversion>;

export function useConversion({
  groupCurrency,
  scenario,
  initialAmount = "",
  suggested = false,
  saved,
}: {
  groupCurrency: string;
  scenario: Scenario;
  initialAmount?: string;
  /** Opened from a suggested settlement. */
  suggested?: boolean;
  /** An entry recorded with a foreign amount, opened again. */
  saved?: { currency: string; amount: string; rate: string; group: string };
}) {
  const gd = digitsOf(groupCurrency);
  const [s, setS] = useState<State>(() =>
    saved
      ? {
          currency: saved.currency,
          amountText: saved.amount,
          groupText: saved.group,
          rateText: saved.rate,
          source: "saved",
          lookup: { status: "idle" },
          suggested: false,
          backwards: false,
        }
      : {
          currency: groupCurrency,
          amountText: initialAmount,
          groupText: "",
          rateText: "",
          source: "proposed",
          lookup: { status: "idle" },
          suggested,
          backwards: false,
        }
  );
  const request = useRef(0);
  const foreign = s.currency !== groupCurrency;
  const fd = digitsOf(s.currency);

  function lookUp(currency: string, date: string) {
    const id = ++request.current;
    setS((p) => ({ ...p, lookup: { status: "looking" } }));
    const timeout = new Promise<LookupAnswer>((r) =>
      setTimeout(() => r({ kind: "temporary" }), 4000)
    );
    void Promise.race([
      fakeLookup(currency, groupCurrency, date, scenario),
      timeout,
    ]).then((answer) => {
      if (id !== request.current) return;
      setS((p) => {
        if (answer.kind !== "ok")
          return { ...p, lookup: { status: answer.kind }, backwards: false };
        const lookup: Lookup = {
          status: "ok",
          rate: answer.rate,
          rateDate: answer.rateDate,
        };
        // Anything typed wins over a late answer.
        if (p.source !== "proposed") return { ...p, lookup };
        const pfd = digitsOf(p.currency);
        const rateText = formatRate(answer.rate);
        if (p.backwards)
          return {
            ...p,
            lookup,
            rateText,
            amountText: backward(p.groupText, answer.rate, pfd, gd),
            backwards: false,
          };
        return {
          ...p,
          lookup,
          rateText,
          groupText: forward(p.amountText, answer.rate, pfd, gd),
        };
      });
    });
  }

  function setCurrency(code: string, date: string) {
    request.current++;
    if (code === groupCurrency) {
      setS((p) => ({
        ...p,
        currency: code,
        amountText: p.groupText || p.amountText,
        groupText: "",
        rateText: "",
        source: "proposed",
        lookup: { status: "idle" },
        backwards: false,
      }));
      return;
    }
    setS((p) => {
      const fromGroup = p.currency === groupCurrency;
      // A suggested settlement keeps its group-currency amount; anything else
      // keeps the typed number as the foreign amount.
      if (fromGroup && p.suggested)
        return {
          ...p,
          currency: code,
          groupText: p.amountText,
          amountText: "",
          rateText: "",
          source: "proposed",
          backwards: true,
        };
      if (!fromGroup && p.suggested)
        return {
          ...p,
          currency: code,
          amountText: "",
          rateText: "",
          source: "proposed",
          backwards: true,
        };
      return {
        ...p,
        currency: code,
        groupText: "",
        rateText: "",
        source: "proposed",
        backwards: false,
      };
    });
    lookUp(code, date);
  }

  function dateChanged(date: string) {
    // Re-opening a saved entry is "Editing a foreign-amount expense or
    // settlement"'s question: the prototype leaves its rate alone.
    if (foreign && s.source !== "saved") lookUp(s.currency, date);
  }

  function setAmount(text: string) {
    setS((p) => {
      const next = {
        ...p,
        amountText: text,
        suggested: false,
        backwards: false,
      };
      if (p.currency === groupCurrency) return next;
      const pfd = digitsOf(p.currency);
      if (p.source === "typed-bank")
        return { ...next, rateText: derivedRate(p.groupText, text, pfd, gd) };
      return { ...next, groupText: forward(text, Number(p.rateText), pfd, gd) };
    });
  }

  function setRate(text: string) {
    setS((p) => ({
      ...p,
      rateText: text,
      source: "typed-rate",
      backwards: false,
      groupText: forward(p.amountText, Number(text), digitsOf(p.currency), gd),
    }));
  }

  function setGroup(text: string) {
    setS((p) => ({
      ...p,
      groupText: text,
      source: "typed-bank",
      backwards: false,
      rateText: derivedRate(text, p.amountText, digitsOf(p.currency), gd),
    }));
  }

  /** Back to the looked-up rate after typing one. */
  function backToProposed(date: string) {
    setS((p) => ({ ...p, source: "proposed" }));
    lookUp(s.currency, date);
  }

  const groupMinor = foreign
    ? parseAmount(s.groupText, gd)
    : parseAmount(s.amountText, gd);

  return {
    ...s,
    foreign,
    groupCurrency,
    fd,
    gd,
    groupMinor,
    setCurrency,
    dateChanged,
    setAmount,
    setRate,
    setGroup,
    retry: (date: string) => lookUp(s.currency, date),
    backToProposed,
  };
}
