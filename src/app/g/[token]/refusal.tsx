/**
 * Why the group service refused a form, read out as it appears. When the
 * entry changed or went since the page was opened, it offers a reload, which
 * shows the latest version so the member can decide again.
 */
export function Refusal({
  text,
  reload = false,
}: {
  text: string | undefined;
  reload?: boolean;
}) {
  return (
    <p role="alert" className="error">
      {text}
      {text && reload && (
        <>
          {" "}
          {/* A full load, not a client navigation: the form starts afresh from the latest version. */}
          <a href="">Reload</a>
        </>
      )}
    </p>
  );
}

/** What a member sees when someone else changed an entry since they opened it. */
export const STALE_MESSAGE =
  "This changed since you opened the page. Reload to see the latest, then try again.";
