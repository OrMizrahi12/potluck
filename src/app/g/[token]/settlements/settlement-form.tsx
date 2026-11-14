"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { LIMITS } from "@/group/limits";
import type {
  AddSettlementRefusal,
  EditSettlementRefusal,
} from "@/group/service";
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

function message(
  refusal: NonNullable<SettlementFormState["refusal"]>,
  { currency, digits }: { currency: string; digits: number }
): string {
  switch (refusal) {
    case "group-unknown":
      return "This group doesn't exist any more.";
    case "settlement-unknown":
      return "This settlement has been deleted.";
    case "stale-version":
      return STALE_MESSAGE;
    case "amount-unreadable":
      return digits === 0
        ? `Type the amount as a whole number, like ${example(0)}.`
        : `Type the amount as a number with up to ${digits} decimals, like ${example(digits)}.`;
    case "amount-not-positive":
      return "The amount must be more than zero.";
    case "amount-too-large":
      return `A settlement can be at most ${LIMITS.amountMajorUnits.toLocaleString("en")} ${currency}. Record a larger one in parts.`;
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
  currency,
  digits,
  members,
  initial,
  editing = false,
}: {
  action: (
    previous: SettlementFormState,
    form: FormData
  ) => Promise<SettlementFormState>;
  currency: string;
  digits: number;
  members: Member[];
  /** The amount is as typed: "12.34". Without a date, it's today. */
  initial: { fromId: string; toId: string; amount: string; date?: string };
  editing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled, so a refused submission keeps what was typed.
  const [fromId, setFromId] = useState(initial.fromId);
  const [toId, setToId] = useState(initial.toId);
  const [amount, setAmount] = useState(initial.amount);
  // A new settlement's date defaults to today where the member is, which only
  // the browser knows.
  const [date, setDate] = useState(initial.date);
  const todayHere = useSyncExternalStore(noSubscription, today, () => "");

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

      <Refusal
        text={state.refusal && message(state.refusal, { currency, digits })}
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
