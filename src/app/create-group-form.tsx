"use client";

import { unstable_rethrow } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { CURRENCIES } from "@/currency/currencies";
import { LIMITS } from "@/group/limits";
import type { CreateGroupRefusal } from "@/group/service";
import { createGroupAction, type CreateGroupFormState } from "./actions";

const {
  groupNameLength: GROUP_NAME_LENGTH,
  memberNameLength: MEMBER_NAME_LENGTH,
  members: MAX_MEMBERS,
} = LIMITS;

const MESSAGES: Record<CreateGroupRefusal, string> = {
  "group-name-missing": "Give the group a name.",
  "group-name-too-long": `Keep the group name to ${GROUP_NAME_LENGTH} characters.`,
  "currency-unknown": "Pick a currency from the list.",
  "members-missing": "Add at least one member.",
  "member-name-missing": "Every member needs a name.",
  "member-name-too-long": `Keep member names to ${MEMBER_NAME_LENGTH} characters.`,
  "member-name-duplicate":
    "Two members have the same name. Give each member a different name.",
  "too-many-members": `A group can have at most ${MAX_MEMBERS} members.`,
};

const UNREACHABLE =
  "Couldn't reach Potluck, so the group wasn't created. Check your connection and try again.";

type Row = { key: number; name: string };

type FormState = CreateGroupFormState & { unreachable?: true };

/**
 * Sends the form to the server. A call that never reaches it (the device is
 * offline, or the connection dropped) rejects; that becomes an error shown on
 * the form instead of the error page, so nothing typed is lost. A redirect
 * after a successful create is Next's to handle, so it's rethrown.
 */
async function send(previous: FormState, form: FormData): Promise<FormState> {
  try {
    return await createGroupAction(previous, form);
  } catch (error) {
    unstable_rethrow(error);
    return { unreachable: true };
  }
}

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    send,
    {}
  );
  // Controlled, so a refused or unsent submission keeps what was typed.
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { key: 0, name: "" },
    { key: 1, name: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  function addRow() {
    setRows([...rows, { key: nextKey, name: "" }]);
    setNextKey(nextKey + 1);
  }

  return (
    <form
      className="stack"
      // Not `action=`: React resets a form after its action, which empties
      // the currency select even though it's controlled.
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => formAction(form));
      }}
    >
      <label className="field">
        <span>Group name</span>
        <input
          name="name"
          required
          maxLength={GROUP_NAME_LENGTH}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Currency</span>
        <select
          name="currency"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="" disabled>
            Choose a currency
          </option>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="stack">
        <legend>Members</legend>
        {rows.map((row, i) => (
          <div key={row.key} className="row">
            <input
              name="member"
              aria-label={`Member ${i + 1}`}
              placeholder={`Member ${i + 1}`}
              required={i === 0}
              maxLength={MEMBER_NAME_LENGTH}
              autoComplete="off"
              value={row.name}
              onChange={(e) =>
                setRows(
                  rows.map((r) =>
                    r.key === row.key ? { ...r, name: e.target.value } : r
                  )
                )
              }
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="secondary"
                aria-label={`Remove member ${i + 1}`}
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {rows.length < MAX_MEMBERS && (
          <button type="button" className="secondary" onClick={addRow}>
            Add member
          </button>
        )}
      </fieldset>

      <p role="alert" className="error">
        {state.unreachable
          ? UNREACHABLE
          : state.refusal && MESSAGES[state.refusal]}
      </p>

      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
