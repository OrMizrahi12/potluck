// The read-only smoke test a production deploy gets once the production
// address serves it (#69). It runs against an address that isn't public yet,
// so nothing it returns names that address: its lines go into a public
// Actions log and a commit status.

/** A link token no group has: the right shape, never generated. */
const MADE_UP_TOKEN = "smokeTestNoSuchGroup00";

/**
 * @typedef {object} SmokeResult
 * @property {boolean} passed
 * @property {string} summary One line for the commit status.
 * @property {string[]} lines One line per step, for the log.
 */

/**
 * @typedef {{ ok: true, status: number, body: string } | { ok: false, reason: string }} Answer
 */

/**
 * Waits until `baseUrl/api/health` names `commit`, then checks that the home
 * page renders and a made-up group link shows "No group at this link".
 *
 * @param {object} options
 * @param {string} options.baseUrl The production address, with no trailing slash.
 * @param {string} options.commit The commit the deploy was built from.
 * @param {number} options.timeoutMs How long to wait for the address to name it.
 * @param {number} options.intervalMs How long to wait between asks.
 * @returns {Promise<SmokeResult>}
 */
export async function runSmoke({ baseUrl, commit, timeoutMs, intervalMs }) {
  const lines = [];
  const fail = (summary) => {
    lines.push(`✗ ${summary}`);
    return { passed: false, summary, lines };
  };

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const health = await ask(baseUrl, "/api/health");
    const seen =
      health.ok && health.status === 200
        ? reportedCommit(health.body)
        : undefined;
    if (seen === commit) break;
    if (Date.now() >= deadline) {
      const lastAnswer =
        typeof seen === "string"
          ? `it still reports ${short(seen)}`
          : seen === null
            ? "it reports no commit"
            : `/api/health ${describe(health)}`;
      return fail(
        `Production never reported ${short(commit)} within ${timeoutMs / 1000}s: ${lastAnswer}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  lines.push(`✓ /api/health reports ${commit}`);

  const home = await ask(baseUrl, "/");
  if (!(
    home.ok &&
    home.status === 200 &&
    home.body.includes("<h1>Potluck</h1>")
  ))
    return fail(`The home page ${describe(home)}, not the Potluck page`);
  lines.push("✓ the home page renders");

  // An unknown link answers 404 (src/app/g/group-link-proxy.ts), and finding
  // out it's unknown asks the database.
  const madeUp = await ask(baseUrl, `/g/${MADE_UP_TOKEN}`);
  if (!(
    madeUp.ok &&
    madeUp.status === 404 &&
    madeUp.body.includes("No group at this link")
  ))
    return fail(
      `A made-up group link ${describe(madeUp)}, not "No group at this link"`
    );
  lines.push('✓ a made-up group link shows "No group at this link"');

  return { passed: true, summary: "Smoke test passed", lines };
}

/** @param {string} sha */
function short(sha) {
  return sha.slice(0, 7);
}

/**
 * What an answer was, in words that never name the address.
 *
 * @param {Answer} answer
 */
function describe(answer) {
  return answer.ok
    ? `answered HTTP ${answer.status}`
    : `didn't answer (${answer.reason})`;
}

/**
 * @param {string} body
 * @returns {string | null | undefined}
 */
function reportedCommit(body) {
  try {
    return JSON.parse(body).commit;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} path
 * @returns {Promise<Answer>}
 */
async function ask(baseUrl, path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      redirect: "manual",
    });
    return { ok: true, status: response.status, body: await response.text() };
  } catch (error) {
    // Only the error code: the cause's message names the host and port.
    const code = error instanceof Error ? error.cause?.code : undefined;
    return { ok: false, reason: typeof code === "string" ? code : "no answer" };
  }
}
