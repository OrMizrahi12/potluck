// The hourly health check (#68): asks production's /api/health and judges
// the answer. .github/workflows/health.yml runs it through
// scripts/health-check-production.mjs, and opens or closes an issue on the
// result.
import { describeAnswer, fetchPage } from "./smoke.mjs";

/** The share of the storage limit that opens an issue (spec #63). */
const STORAGE_ALERT = 0.8;

/**
 * @typedef {object} HealthResult
 * @property {boolean} passed
 * @property {string} summary One line for the issue.
 */

/**
 * Asks `baseUrl/api/health` whether production is healthy. A failing answer
 * is asked again once, so a blip (a database waking up, a dropped request)
 * doesn't open an issue.
 *
 * @param {object} options
 * @param {string} options.baseUrl The address to check, with no trailing slash.
 * @param {number} options.retryAfterMs How long to wait before asking again
 *   when the first answer fails.
 * @returns {Promise<HealthResult>}
 */
export async function checkHealth({ baseUrl, retryAfterMs }) {
  const first = await askOnce(baseUrl);
  if (first.passed) return first;
  await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  return askOnce(baseUrl);
}

/**
 * @param {string} baseUrl
 * @returns {Promise<HealthResult>}
 */
async function askOnce(baseUrl) {
  const answer = await fetchPage(baseUrl, "/api/health");
  const database = answer.ok ? databaseHealth(answer.body) : undefined;
  if (!database)
    return {
      passed: false,
      summary: `/api/health ${describeAnswer(answer)}, not with a health report`,
    };
  if (!database.reachable)
    return { passed: false, summary: "Production can't reach its database" };
  if (!database.schemaCurrent)
    return {
      passed: false,
      summary: "The database's schema isn't current: a migration hasn't run",
    };
  const { bytes, limitBytes } = database.storage;
  if (bytes >= STORAGE_ALERT * limitBytes)
    return {
      passed: false,
      summary: `Storage is at ${percent(bytes, limitBytes)} of the plan's limit`,
    };
  return {
    passed: true,
    summary: `Healthy: storage at ${percent(bytes, limitBytes)} of the limit`,
  };
}

/**
 * @param {number} bytes
 * @param {number} limitBytes
 */
function percent(bytes, limitBytes) {
  return `${Math.round((bytes / limitBytes) * 100)}%`;
}

/**
 * The `database` part of a health report, or undefined when the body isn't
 * one (an error page, a paused deployment, the wrong address). A reachable
 * database always reports its storage.
 *
 * @param {string} body
 */
function databaseHealth(body) {
  try {
    const { database } = JSON.parse(body);
    if (
      typeof database?.reachable === "boolean" &&
      typeof database?.schemaCurrent === "boolean" &&
      (!database.reachable ||
        (typeof database.storage?.bytes === "number" &&
          typeof database.storage?.limitBytes === "number"))
    )
      return database;
  } catch {
    // Not JSON.
  }
  return undefined;
}
