"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { LIMITS } from "@/group/limits";
import type {
  AddSettlementRefusal,
  EditSettlementRefusal,
} from "@/group/service";
import { formatAmount } from "@/money/format";
import {
  AmountField,
  useAmountField,
  type AmountFieldState,
  type InitialForeignPart,
} from "../amount-field";
import { Refusal, STALE_MESSAGE } from "../refusal";

type Member = { id: string; name: string };

export type SettlementFormState = {
  refusal?: AddSettlementRefusal | EditSettlementRefusal;
};

const noSubscription = () => () => {};

/** Today on this device's calendar, as YYYY-MM-DD. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** An amount as it's typed in this currency: "1500", "12.50", "12.500". */
function example(digits: number): string {
  return digits === 0 ? "1500" : `12.${"5".padEnd(digits, "0")}`;
}

/**
 * Why a foreign amount's converted figure can't be recorded, named in the
 * group currency, so it shows before saving. Nothing is rounded up to get
 * past it.
 */
function conversionProblem(
  field: AmountFieldState,
  locale: string
): string | undefined {
  const { foreignCurrency, groupAmount, currency, digits } = field;
  if (!foreignCurrency || groupAmount === undefined) return undefined;
  if (groupAmount === 0)
    return `This converts to less than ${formatAmount(1, { currency, digits }, locale)}.`;
  if (groupAmount > LIMITS.amountMajorUnits * 10 ** digits)
    return `This converts to more than ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}, the most one settlement can be. Record a larger one in parts.`;
  return undefined;
}

function message(
  refusal: NonNullable<SettlementFormState["refusal"]>,
  { field, locale }: { field: AmountFieldState; locale: string }
): string {
  const { currency, digits, foreignCurrency } = field;
  const typedDigits = foreignCurrency?.digits ?? digits;
  switch (refusal) {
    case "group-unknown":
      return "This group doesn't exist any more.";
    case "settlement-unknown":
      return "This settlement has been deleted.";
    case "stale-version":
      return STALE_MESSAGE;
    case "amount-unreadable":
    case "foreign-amount-unreadable":
      return typedDigits === 0
        ? `Type the amount as a whole number, like ${example(0)}.`
        : `Type the amount as a number with up to ${typedDigits} decimals, like ${example(typedDigits)}.`;
    case "amount-not-positive":
    case "foreign-amount-converts-to-zero":
      return (
        conversionProblem(field, locale) ?? "The amount must be more than zero."
      );
    case "foreign-amount-not-positive":
      return "The amount must be more than zero.";
    case "amount-too-large":
      return (
        conversionProblem(field, locale) ??
        `A settlement can be at most ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}. Record a larger one in parts.`
      );
    case "foreign-amount-too-large":
      return "Type the amount with at most 12 digits before the decimal point.";
    case "foreign-currency-unknown":
    case "foreign-currency-is-group-currency":
      return "Pick a currency from the list.";
    case "exchange-rate-unreadable":
      return `Type the exchange rate, or what your bank charged in ${currency}.`;
    case "exchange-rate-not-positive":
      return "The exchange rate must be more than zero.";
    case "amount-disagrees-with-rate":
      return `The amount in ${currency} doesn't match the exchange rate. Check the rate and try again.`;
    case "date-unreadable":
      return "Pick the date of the settlement.";
    case "from-unknown":
      return "Choose who paid.";
    case "to-unknown":
      return "Choose who was paid.";
    case "settlement-to-self":
      return "Choose two different members.";
    case "too-many-settlements":
      return `This group has reached its limit of ${LIMITS.settlements.toLocaleString("en")} settlements.`;
  }
}

/**
 * Records that one member paid another. A suggested settlement opens it with
 * `from`, `to` and `amount` filled in, all of which can still be changed.
 * With `editing`, it edits a recorded settlement whose `initial` has a date.
 */
export function SettlementForm({
  action,
  token,
  currency,
  digits,
  locale,
  members,
  initial,
  editing = false,
}: {
  action: (
    previous: SettlementFormState,
    form: FormData
  ) => Promise<SettlementFormState>;
  token: string;
  currency: string;
  digits: number;
  /** For amounts shown in the form, as the server formats them. */
  locale: string;
  members: Member[];
  /** The amount is as typed: "12.34". Without a date, it's today. */
  initial: {
    fromId: string;
    toId: string;
    /** In the group currency. */
    amount: string;
    date?: string;
    foreign?: InitialForeignPart;
  };
  editing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled, so a refused submission keeps what was typed.
  const [fromId, setFromId] = useState(initial.fromId);
  const [toId, setToId] = useState(initial.toId);
  // A new settlement's date defaults to today where the member is, which only
  // the browser knows.
  const [date, setDate] = useState(initial.date);
  const todayHere = useSyncExternalStore(noSubscription, today, () => "");
  const amountField = useAmountField({
    token,
    currency,
    digits,
    date: date ?? todayHere,
    initialAmount: initial.amount,
    initialForeign: initial.foreign,
  });

  // A converted figure the service would refuse shows as it's typed; a
  // refusal saying the same after saving isn't repeated.
  const liveProblem = conversionProblem(amountField, locale);
  const refusalText =
    state.refusal && message(state.refusal, { field: amountField, locale });

  return (
    <form
      action={formAction}
      className="stack"
      aria-label={editing ? "Edit the settlement" : "Record a settlement"}
    >
      <label className="field">
        <span>From</span>
        <select
          name="from"
          required
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          <option value="" disabled>
            Choose who paid
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>To</span>
        <select
          name="to"
          required
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          <option value="" disabled>
            Choose who was paid
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <AmountField field={amountField} locale={locale} problem={liveProblem} />

      <label className="field">
        <span>Date</span>
        <input
          name="date"
          type="date"
          required
          value={date ?? todayHere}
          onChange={(e) => {
            setDate(e.target.value);
            amountField.changeDate(e.target.value);
          }}
        />
      </label>

      <Refusal
        text={refusalText === liveProblem ? undefined : refusalText}
        reload={state.refusal === "stale-version"}
      />

      <button type="submit" disabled={pending}>
        {editing
          ? pending
            ? "Saving…"
            : "Save changes"
          : pending
            ? "Recording…"
            : "Record settlement"}
      </button>
    </form>
  );
}
