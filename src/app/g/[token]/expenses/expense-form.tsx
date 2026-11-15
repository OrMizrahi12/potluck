"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useClaim } from "@/device/store";
import { LIMITS } from "@/group/limits";
import type { AddExpenseRefusal, EditExpenseRefusal } from "@/group/service";
import { formatAmount } from "@/money/format";
import {
  AmountField,
  useAmountField,
  type AmountFieldState,
  type InitialForeignPart,
} from "../amount-field";
import { Refusal, STALE_MESSAGE } from "../refusal";
import { WhoAreYouPrompt } from "../who-are-you";

type Member = { id: string; name: string; active: boolean };

export type ExpenseFormState = {
  refusal?: AddExpenseRefusal | EditExpenseRefusal;
  /** How many participants were chosen, for "too small to split among N". */
  participants?: number;
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
  participants: number,
  locale: string
): string | undefined {
  const { foreignCurrency, groupAmount, currency, digits } = field;
  if (!foreignCurrency || groupAmount === undefined) return undefined;
  const money = (minor: number) =>
    formatAmount(minor, { currency, digits }, locale);
  if (groupAmount === 0) return `This converts to less than ${money(1)}.`;
  if (groupAmount > LIMITS.amountMajorUnits * 10 ** digits)
    return `This converts to more than ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}, the most one expense can be.`;
  if (groupAmount < participants)
    return `${money(groupAmount)} is too small to split among ${participants}.`;
  return undefined;
}

function message(
  refusal: NonNullable<ExpenseFormState["refusal"]>,
  {
    field,
    participants,
    locale,
  }: {
    field: AmountFieldState;
    participants: number;
    locale: string;
  }
): string {
  const { currency, digits, foreignCurrency } = field;
  const typedDigits = foreignCurrency?.digits ?? digits;
  switch (refusal) {
    case "group-unknown":
      return "This group doesn't exist any more.";
    case "expense-unknown":
      return "This expense has been deleted.";
    case "stale-version":
      return STALE_MESSAGE;
    case "description-missing":
      return "Say what the expense was for.";
    case "description-too-long":
      return `Keep the description to ${LIMITS.descriptionLength} characters.`;
    case "amount-unreadable":
    case "foreign-amount-unreadable":
      return typedDigits === 0
        ? `Type the amount as a whole number, like ${example(0)}.`
        : `Type the amount as a number with up to ${typedDigits} decimals, like ${example(typedDigits)}.`;
    case "amount-not-positive":
      return (
        conversionProblem(field, participants, locale) ??
        "The amount must be more than zero."
      );
    case "foreign-amount-not-positive":
      return "The amount must be more than zero.";
    case "amount-too-large":
      return (
        conversionProblem(field, participants, locale) ??
        `An expense can be at most ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}.`
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
      return "Pick the date of the expense.";
    case "payer-unknown":
      return "Choose who paid.";
    case "participant-unknown":
      return "A participant isn't in this group any more. Reload the page and try again.";
    case "participants-only-payer":
      return "Choose at least one participant besides the payer.";
    case "amount-too-small-to-split":
      return (
        conversionProblem(field, participants, locale) ??
        `This amount is too small to split among ${participants}.`
      );
    case "too-many-expenses":
      return `This group has reached its limit of ${LIMITS.expenses.toLocaleString("en")} expenses.`;
  }
}

/**
 * Adds an expense, or edits one when `initial` holds it. The amount is as
 * typed: "12.34". Without `initial`, active members are the participants and
 * the date is today, the payer is the member this device claims, and the
 * form waits until the device has said which member it is.
 */
export function ExpenseForm({
  action,
  token,
  currency,
  digits,
  locale,
  members,
  initial,
}: {
  action: (
    previous: ExpenseFormState,
    form: FormData
  ) => Promise<ExpenseFormState>;
  token: string;
  currency: string;
  digits: number;
  /** For amounts shown in the form, as the server formats them. */
  locale: string;
  members: Member[];
  initial?: {
    description: string;
    /** In the group currency. */
    amount: string;
    date: string;
    payerId: string;
    participantIds: string[];
    foreign?: InitialForeignPart;
  };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled, so a refused submission keeps what was typed.
  const [description, setDescription] = useState(initial?.description ?? "");
  // A new expense's date defaults to today where the member is, which only
  // the browser knows.
  const [date, setDate] = useState(initial?.date);
  const todayHere = useSyncExternalStore(noSubscription, today, () => "");
  const amountField = useAmountField({
    token,
    currency,
    digits,
    date: date ?? todayHere,
    initialAmount: initial?.amount,
    initialForeign: initial?.foreign,
  });
  // A new expense's payer defaults to the member this device claims.
  const [payerId, setPayerId] = useState(initial?.payerId);
  const claim = useClaim(
    token,
    members.map((m) => m.id)
  );
  const claimed = claim?.claimed;
  const [participantIds, setParticipantIds] = useState(
    () =>
      new Set(
        initial?.participantIds ??
          members.filter((m) => m.active).map((m) => m.id)
      )
  );

  function toggle(id: string, checked: boolean) {
    const next = new Set(participantIds);
    if (checked) next.add(id);
    else next.delete(id);
    setParticipantIds(next);
  }

  // A converted figure the service would refuse shows as it's typed; a
  // refusal saying the same after saving isn't repeated.
  const liveProblem = conversionProblem(
    amountField,
    participantIds.size,
    locale
  );
  const refusalText =
    state.refusal &&
    message(state.refusal, {
      field: amountField,
      participants: state.participants ?? 0,
      locale,
    });

  const editing = initial !== undefined;
  // Which member this device is lives only in the browser, so adding waits
  // for it; an expense can't be added before it's answered. Editing names
  // its payer already.
  if (!editing) {
    if (!claim) return null;
    if (!claimed)
      return (
        <WhoAreYouPrompt token={token} members={members} skippable={false}>
          Say which member you are before adding an expense. It&apos;s only
          remembered on this device.
        </WhoAreYouPrompt>
      );
  }

  return (
    <form
      action={formAction}
      className="stack"
      aria-label={editing ? "Edit the expense" : "Add an expense"}
    >
      <label className="field">
        <span>Description</span>
        <input
          name="description"
          required
          maxLength={LIMITS.descriptionLength}
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
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

      <label className="field">
        <span>Paid by</span>
        <select
          name="payer"
          required
          value={payerId ?? claimed ?? ""}
          onChange={(e) => setPayerId(e.target.value)}
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

      <fieldset className="stack">
        <legend>Split equally among</legend>
        {members.map((m) => (
          <label key={m.id} className="check">
            <input
              type="checkbox"
              name="participant"
              value={m.id}
              checked={participantIds.has(m.id)}
              onChange={(e) => toggle(m.id, e.target.checked)}
            />
            <span>{m.name}</span>
          </label>
        ))}
      </fieldset>

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
            ? "Adding…"
            : "Add expense"}
      </button>
    </form>
  );
}
