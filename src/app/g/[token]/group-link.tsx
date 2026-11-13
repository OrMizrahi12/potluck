"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * The group's link with a share button (the phone's share sheet, where the
 * browser has one) and a copy button. If the clipboard is blocked, the link
 * is selected so it can be copied by hand. The link is the bare page
 * address, without whatever query or fragment this visit happened to carry.
 */
export function GroupLink() {
  const url = useSyncExternalStore(
    noSubscription,
    () => window.location.origin + window.location.pathname,
    () => ""
  );
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false
  );
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      input.current?.select();
      setStatus(
        "Couldn't copy automatically. The link is selected: copy it from there."
      );
    }
  }

  async function share() {
    try {
      await navigator.share({ title: document.title, url });
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        await copy();
    }
  }

  return (
    <section className="stack" aria-label="Group link">
      <p>
        Anyone with this link can see and change the group. Share it only with
        members.
      </p>
      <input
        ref={input}
        readOnly
        value={url}
        aria-label="Group link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="row">
        {canShare && (
          <button type="button" onClick={share}>
            Share link
          </button>
        )}
        <button
          type="button"
          className={canShare ? "secondary" : undefined}
          onClick={copy}
        >
          Copy link
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
