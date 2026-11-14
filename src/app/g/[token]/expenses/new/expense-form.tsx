"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { LIMITS } from "@/group/limits";
import type { AddExpenseRefusal } from "@/group/service";
import type { AddExpenseFormState } from "./actions";

type Member = { id: string; name: string; active: boolean };

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

function message(
  refusal: AddExpenseRefusal,
  {
    currency,
    digits,
    participants,
  }: {
    currency: string;
    digits: number;
    participants: number;
  }
): string {
  switch (refusal) {
    case "group-unknown":
      return "This group doesn't exist any more.";
    case "description-missing":
      return "Say what the expense was for.";
    case "description-too-long":
      return `Keep the description to ${LIMITS.descriptionLength} characters.`;
    case "amount-unreadable":
      return digits === 0
        ? `Type the amount as a whole number, like ${example(0)}.`
        : `Type the amount as a number with up to ${digits} decimals, like ${example(digits)}.`;
    case "amount-not-positive":
      return "The amount must be more than zero.";
    case "amount-too-large":
      return `An expense can be at most ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}.`;
    case "date-unreadable":
      return "Pick the date of the expense.";
    case "payer-unknown":
      return "Choose who paid.";
    case "participant-unknown":
      return "A participant isn't in this group any more. Reload the page and try again.";
    case "participants-only-payer":
      return "Choose at least one participant besides the payer.";
    case "amount-too-small-to-split":
      return `This amount is too small to split among ${participants}.`;
    case "too-many-expenses":
      return `This group has reached its limit of ${LIMITS.expenses.toLocaleString("en")} expenses.`;
  }
}

export function ExpenseForm({
  action,
  currency,
  digits,
  members,
}: {
  action: (
    previous: AddExpenseFormState,
    form: FormData
  ) => Promise<AddExpenseFormState>;
  currency: string;
  digits: number;
  members: Member[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled, so a refused submission keeps what was typed.
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [participantIds, setParticipantIds] = useState(
    () => new Set(members.filter((m) => m.active).map((m) => m.id))
  );
  // The date defaults to today where the member is, which only the browser knows.
  const [date, setDate] = useState<string>();
  const todayHere = useSyncExternalStore(noSubscription, today, () => "");

  function toggle(id: string, checked: boolean) {
    const next = new Set(participantIds);
    if (checked) next.add(id);
    else next.delete(id);
    setParticipantIds(next);
  }

  return (
    <form action={formAction} className="stack" aria-label="Add an expense">
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

      <label className="field">
        <span>Amount ({currency})</span>
        <input
          name="amount"
          required
          inputMode={digits === 0 ? "numeric" : "decimal"}
          placeholder={digits === 0 ? "0" : `0.${"0".repeat(digits)}`}
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Date</span>
        <input
          name="date"
          type="date"
          required
          value={date ?? todayHere}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Paid by</span>
        <select
          name="payer"
          required
          value={payerId}
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

      <p role="alert" className="error">
        {state.refusal &&
          message(state.refusal, {
            currency,
            digits,
            participants: state.participants ?? 0,
          })}
      </p>

      <button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add expense"}
      </button>
    </form>
  );
}
