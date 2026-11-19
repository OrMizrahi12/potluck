// The read-only smoke test for a commit main built (#69). For now it runs
// after Vercel says the production build succeeded, against the production
// address once that address reports the commit, so it checks the release
// rather than holding it back.

/** A link token no group has: the right shape, never generated. */
const MADE_UP_TOKEN = "smokeTestNoSuchGroup00";

/** How long one request gets before it counts as no answer. */
const REQUEST_TIMEOUT_MS = 30 * 1000;

/**
 * @typedef {object} SmokeResult
 * @property {boolean} passed
 * @property {string} summary One line for the commit status.
 * @property {string[]} lines One line per step, for the log.
 */

/**
 * @typedef {{ ok: true, status: number, body: string } | { ok: false, reason: string }} PageAnswer
 */

/**
 * Waits until `baseUrl/api/health` names `commit`, then checks that the home
 * page renders and a made-up group link shows "No group at this link".
 *
 * If the address reports a later commit instead, a newer release has already
 * replaced this one: it passes at once, untested, and says so. That later
 * commit gets its own smoke test, which covers this one's code too.
 *
 * @param {object} options
 * @param {string} options.baseUrl The production address, with no trailing slash.
 * @param {string} options.commit The commit main built.
 * @param {number} options.timeoutMs How long to wait for the address to name it.
 * @param {number} options.intervalMs How long to wait between asks.
 * @param {(seen: string) => Promise<boolean>} options.isNewer Whether a commit
 *   the address reports comes after `commit` on main.
 * @returns {Promise<SmokeResult>}
 */
export async function runSmoke({
  baseUrl,
  commit,
  timeoutMs,
  intervalMs,
  isNewer,
}) {
  const lines = [];
  const fail = (summary) => {
    lines.push(`✗ ${summary}`);
    return { passed: false, summary, lines };
  };

  const deadline = Date.now() + timeoutMs;
  /** Commits already found not to be newer, so GitHub is asked once each. */
  const notNewer = new Set();
  for (;;) {
    const health = await fetchPage(baseUrl, "/api/health");
    const seen =
      health.ok && health.status === 200
        ? reportedCommit(health.body)
        : undefined;
    if (seen === commit) break;
    if (typeof seen === "string" && !notNewer.has(seen)) {
      if (await isNewer(seen)) {
        const summary = `Not smoke-tested: production moved on to ${short(seen)}`;
        lines.push(`– ${summary}`);
        return { passed: true, summary, lines };
      }
      notNewer.add(seen);
    }
    if (Date.now() >= deadline) {
      const lastAnswer =
        typeof seen === "string"
          ? `it still reports ${short(seen)}`
          : seen === null
            ? "it reports no commit"
            : `/api/health ${describeAnswer(health)}`;
      return fail(
        `Production never reported ${short(commit)} within ${timeoutMs / 1000}s: ${lastAnswer}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  lines.push(`✓ /api/health reports ${commit}`);

  const home = await fetchPage(baseUrl, "/");
  if (!shows(home, 200, "<h1>Potluck</h1>"))
    return fail(`The home page ${describeAnswer(home)}, not the Potluck page`);
  lines.push("✓ the home page renders");

  // An unknown link answers 404 (src/app/g/group-link-proxy.ts), and finding
  // out it's unknown asks the database.
  const madeUp = await fetchPage(baseUrl, `/g/${MADE_UP_TOKEN}`);
  if (!shows(madeUp, 404, "No group at this link"))
    return fail(
      `A made-up group link ${describeAnswer(madeUp)}, not "No group at this link"`
    );
  lines.push('✓ a made-up group link shows "No group at this link"');

  return { passed: true, summary: "Smoke test passed", lines };
}

/**
 * @param {PageAnswer} answer
 * @param {number} status
 * @param {string} text
 */
function shows(answer, status, text) {
  return answer.ok && answer.status === status && answer.body.includes(text);
}

/** @param {string} sha */
function short(sha) {
  return sha.slice(0, 7);
}

/**
 * What a page answered, short enough for a commit status.
 *
 * @param {PageAnswer} answer
 */
export function describeAnswer(answer) {
  return answer.ok
    ? `answered HTTP ${answer.status}`
    : `didn't answer (${answer.reason})`;
}

/**
 * The commit a health answer names: null when it names none (as before
 * /api/health reported one), undefined when it isn't a health answer.
 *
 * @param {string} body
 * @returns {string | null | undefined}
 */
function reportedCommit(body) {
  try {
    const { commit } = JSON.parse(body);
    return typeof commit === "string" ? commit : null;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} path
 * @returns {Promise<PageAnswer>}
 */
export async function fetchPage(baseUrl, path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: true, status: response.status, body: await response.text() };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      return { ok: false, reason: "timed out" };
    // Only the error code, which fits a commit status.
    const code = error instanceof Error ? error.cause?.code : undefined;
    return { ok: false, reason: typeof code === "string" ? code : "no answer" };
  }
}
