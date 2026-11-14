"use client";

import { useActionState, useLayoutEffect, useState } from "react";
import { Refusal, STALE_MESSAGE } from "./refusal";

export type DeleteEntryState = {
  refusal?: "group-unknown" | "entry-unknown" | "stale-version";
};

/**
 * Deletes an expense or a settlement after one confirmation that says it
 * can't be undone.
 */
export function DeleteEntry({
  action,
  entry,
}: {
  action: (previous: DeleteEntryState) => Promise<DeleteEntryState>;
  /** What's deleted, as the buttons name it: "expense" or "settlement". */
  entry: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  // A confirmation is a moment's question: a member coming back to this page
  // later finds it asked afresh, not already half-answered.
  useLayoutEffect(() => () => setConfirming(false), []);

  return (
    <form
      action={formAction}
      className="stack"
      aria-label={`Delete the ${entry}`}
    >
      {confirming ? (
        <>
          <p>Delete this {entry} for good? This can&apos;t be undone.</p>
          <div className="actions">
            <button type="submit" disabled={pending}>
              {pending ? "Deleting…" : `Yes, delete the ${entry}`}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setConfirming(true)}
          >
            Delete {entry}
          </button>
        </div>
      )}
      <Refusal
        text={state.refusal && message(state.refusal, entry)}
        reload={state.refusal === "stale-version"}
      />
    </form>
  );
}

function message(
  refusal: NonNullable<DeleteEntryState["refusal"]>,
  entry: string
): string {
  switch (refusal) {
    case "group-unknown":
      return "This group doesn't exist any more.";
    case "entry-unknown":
      return `This ${entry} has already been deleted.`;
    case "stale-version":
      return STALE_MESSAGE;
  }
}
