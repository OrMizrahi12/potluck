// A stand-in for Frankfurter v2's range query, which local runs and browser
// tests ask instead of the real thing (see rate-source.ts). Its answers are
// fixed and depend only on the foreign currency's code (Frankfurter's
// `base`):
//
//   CHF  1.0463 on the asked date
//   USD  0.925926 on the asked date
//   JPY  0.0062 on the asked date
//   SEK  0.0874 from two days before the asked date
//   NOK  0.0851 on the asked date, after 2 seconds: late, but in time
//   THB  answers after 6 seconds, past the lookup's 4-second wait
//   HUF  down: 503
//   BOV  not covered: 422, as Frankfurter answers it
//   any other code: 1.25 on the asked date
//
// It is never served on a Vercel deployment.

/** How the fake answers each code it treats specially. */
const BEHAVIOUR = new Map<
  string,
  | { rate: string; daysEarlier?: number; afterMs?: number }
  | { status: number; afterMs?: number }
>([
  ["CHF", { rate: "1.0463" }],
  ["USD", { rate: "0.925926" }],
  ["JPY", { rate: "0.0062" }],
  ["SEK", { rate: "0.0874", daysEarlier: 2 }],
  ["NOK", { rate: "0.0851", afterMs: 2000 }],
  ["THB", { rate: "0.0262", afterMs: 6000 }],
  ["HUF", { status: 503 }],
  ["BOV", { status: 422 }],
]);

/**
 * The fake's answer to `url`, `…/rates?from&to&base&quotes`, written as
 * Frankfurter writes it. On a Vercel deployment it answers an empty 404, as
 * if it didn't exist. `signal` stops a slow answer, as a dropped request
 * would.
 */
export async function answerAsFakeFrankfurter(
  url: URL,
  env: Record<string, string | undefined>,
  signal?: AbortSignal
): Promise<Response> {
  if (env.VERCEL) return new Response(null, { status: 404 });

  const base = url.searchParams.get("base") ?? "";
  const quote = url.searchParams.get("quotes") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const behaviour = BEHAVIOUR.get(base) ?? { rate: "1.25" };
  if (behaviour.afterMs) await wait(behaviour.afterMs, signal);
  // Nobody is waiting any more: answer quietly rather than fail the request.
  if (signal?.aborted) return new Response(null, { status: 499 });

  if ("status" in behaviour) {
    return Response.json(
      { status: behaviour.status, message: `fake answer for ${base}` },
      { status: behaviour.status }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json(
      { status: 422, message: "invalid date" },
      { status: 422 }
    );
  }
  const date = addDays(to, -(behaviour.daysEarlier ?? 0));
  // Written by hand so the rate goes out exactly as listed above.
  return new Response(
    `[{"date":"${date}","base":"${base}","quote":"${quote}","rate":${behaviour.rate}}]`,
    { headers: { "content-type": "application/json" } }
  );
}

/** Waits `ms`, or until `signal` aborts. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** YYYY-MM-DD `days` calendar days after `date`. */
function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}
