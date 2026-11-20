"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Copies the group's plain-text summary, built by the server, to paste into
 * the group chat. If the clipboard is blocked, the summary is shown selected
 * so it can be copied by hand. Like the group link's copy, without a share
 * button.
 */
export function CopySummary({ summary }: { summary: string }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");
  const [showText, setShowText] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setStatus("Summary copied.");
    } catch {
      // Render the textarea before selecting its text.
      flushSync(() => setShowText(true));
      textarea.current?.select();
      setStatus(
        "Couldn't copy automatically. The summary is selected: copy it from there."
      );
    }
  }

  return (
    <section className="stack" aria-label="Group summary">
      {showText && (
        <textarea
          ref={textarea}
          readOnly
          value={summary}
          rows={summary.split("\n").length}
          aria-label="Summary to copy"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <div className="row">
        <button type="button" className="secondary" onClick={copy}>
          Copy summary
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
