"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { CURRENCIES } from "@/currency/currencies";
import { forgetGroup } from "@/device/store";
import { LIMITS } from "@/group/limits";
import type {
  AddMemberRefusal,
  ChangeCurrencyRefusal,
  DeleteGroupRefusal,
  DeleteMemberRefusal,
  RenameMemberRefusal,
  SetMemberActiveRefusal,
} from "@/group/service";
import {
  addMemberAction,
  changeCurrencyAction,
  deleteGroupAction,
  deleteMemberAction,
  renameMemberAction,
  setMemberActiveAction,
} from "./actions";

/** Why a settings command changed nothing: the service refused it, or it never reached the server. */
type Problem =
  | AddMemberRefusal
  | RenameMemberRefusal
  | SetMemberActiveRefusal
  | DeleteMemberRefusal
  | ChangeCurrencyRefusal
  | DeleteGroupRefusal
  | "unreachable";

const MESSAGES: Record<Problem, string> = {
  unreachable:
    "Couldn't reach Potluck, so nothing changed. Check your connection and try again.",
  "group-unknown": "This group doesn't exist any more.",
  "stale-version":
    "This changed since you opened the page. Reload to see the latest, then try again.",
  "member-unknown":
    "This member isn't in the group any more. Reload to see the latest.",
  "member-name-missing": "Give the member a name.",
  "member-name-too-long": `Keep member names to ${LIMITS.memberNameLength} characters.`,
  "member-name-duplicate": "Another member already has that name.",
  "too-many-members": `This group has reached its limit of ${LIMITS.members} members.`,
  "member-referenced":
    "This member appears in an expense or a settlement, so they can't be deleted. Make them inactive instead.",
  "currency-unknown": "Pick a currency from the list.",
  "group-has-entries":
    "The currency can't be changed once the group has an expense or a settlement.",
};

/**
 * Runs a settings command from a form. A call that never reaches the server
 * becomes an error on the form instead of the error page, so nothing typed is
 * lost; a redirect is Next's to handle, so it's rethrown.
 */
function useCommand(
  command: (form: FormData) => Promise<Problem | undefined>,
  onDone?: () => void
) {
  const [problem, run, pending] = useActionState<Problem | undefined, FormData>(
    async (_previous, form) => {
      try {
        const refusal = await command(form);
        if (!refusal) onDone?.();
        return refusal;
      } catch (error) {
        unstable_rethrow(error);
        return "unreachable";
      }
    },
    undefined
  );
  return {
    pending,
    alert: (
      <p role="alert" className="error">
        {problem && MESSAGES[problem]}
      </p>
    ),
    // Not `action=`: React resets a form after its action, which would
    // empty its controlled fields even when the command was refused.
    onSubmit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      startTransition(() => run(form));
    },
  };
}

type MemberRef = { id: string; version: number };

function MemberFields({ member }: { member: MemberRef }) {
  return (
    <>
      <input type="hidden" name="member" value={member.id} />
      <input type="hidden" name="version" value={member.version} />
    </>
  );
}

export function RenameMemberForm({
  token,
  member,
}: {
  token: string;
  member: MemberRef & { name: string };
}) {
  const [name, setName] = useState(member.name);
  const { onSubmit, alert, pending } = useCommand((form) =>
    renameMemberAction(token, form)
  );

  return (
    <form onSubmit={onSubmit} className="stack">
      <MemberFields member={member} />
      <div className="row">
        <input
          name="name"
          aria-label="Name"
          required
          maxLength={LIMITS.memberNameLength}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="secondary"
          disabled={pending || name === member.name}
        >
          Rename
        </button>
      </div>
      {alert}
    </form>
  );
}

export function MemberActiveForm({
  token,
  member,
}: {
  token: string;
  member: MemberRef & { active: boolean };
}) {
  const { onSubmit, alert, pending } = useCommand((form) =>
    setMemberActiveAction(token, form)
  );

  return (
    <form onSubmit={onSubmit} className="stack">
      <MemberFields member={member} />
      <input type="hidden" name="active" value={String(!member.active)} />
      <button type="submit" className="secondary" disabled={pending}>
        {member.active ? "Make inactive" : "Make active"}
      </button>
      {alert}
    </form>
  );
}

export function DeleteMemberForm({
  token,
  member,
}: {
  token: string;
  member: MemberRef & { name: string };
}) {
  const [confirming, setConfirming] = useState(false);
  const { onSubmit, alert, pending } = useCommand((form) =>
    deleteMemberAction(token, form)
  );

  if (!confirming)
    return (
      <button
        type="button"
        className="secondary"
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );

  return (
    <form
      onSubmit={onSubmit}
      className="prompt stack"
      role="alertdialog"
      aria-label={`Delete ${member.name}?`}
    >
      <MemberFields member={member} />
      <p>Delete {member.name} from the group? This can&apos;t be undone.</p>
      <div className="actions">
        <button type="submit" disabled={pending}>
          Delete for good
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
      {alert}
    </form>
  );
}

export function AddMemberForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const { onSubmit, alert, pending } = useCommand(
    (form) => addMemberAction(token, form),
    () => setName("")
  );

  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Add a member">
      <label className="field">
        <span>New member</span>
        <input
          name="name"
          required
          maxLength={LIMITS.memberNameLength}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" disabled={pending}>
        Add member
      </button>
      {alert}
    </form>
  );
}

export function ChangeCurrencyForm({
  token,
  group,
}: {
  token: string;
  group: { currency: string; version: number };
}) {
  const [currency, setCurrency] = useState(group.currency);
  const { onSubmit, alert, pending } = useCommand((form) =>
    changeCurrencyAction(token, form)
  );

  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Change currency">
      <input type="hidden" name="version" value={group.version} />
      <label className="field">
        <span>Currency</span>
        <select
          name="currency"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending || currency === group.currency}>
        Change currency
      </button>
      {alert}
    </form>
  );
}

/**
 * Deletes the group after one confirmation that says plainly it can't be
 * undone. Then this device forgets the group, and the page goes home.
 */
export function DeleteGroupForm({
  token,
  group,
}: {
  token: string;
  group: { name: string; version: number };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { onSubmit, alert, pending } = useCommand(
    (form) => deleteGroupAction(token, form),
    () => {
      forgetGroup(token);
      router.replace("/");
    }
  );

  if (!confirming)
    return (
      <button
        type="button"
        className="secondary"
        onClick={() => setConfirming(true)}
      >
        Delete this group
      </button>
    );

  return (
    <form
      onSubmit={onSubmit}
      className="prompt stack"
      role="alertdialog"
      aria-labelledby="delete-group"
    >
      <input type="hidden" name="version" value={group.version} />
      <h3 id="delete-group">Delete this group?</h3>
      <p>
        This deletes <strong className="name">{group.name}</strong> for
        everyone: its members, expenses and settlements. This can&apos;t be
        undone. The group&apos;s link will stop working.
      </p>
      <div className="actions">
        <button type="submit" disabled={pending}>
          Delete for good
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
      {alert}
    </form>
  );
}
