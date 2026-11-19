// Sends one check-in to a Sentry cron monitor over Sentry's HTTP API, the
// way https://docs.sentry.io/product/crons/getting-started/http/ describes.
// The nightly backup (#11) runs it through scripts/backup-check-in.mjs.

/**
 * @typedef {object} CheckInResult
 * @property {boolean} sent Whether Sentry accepted the check-in.
 * @property {string} summary One line for the log. Never holds the DSN.
 */

/**
 * Posts a check-in to the monitor `slug` in the project the DSN names, on the
 * DSN's own ingest host (so its data region holds). The monitor config goes
 * with it, so Sentry creates the monitor on the first check-in and keeps it
 * in step with the workflow's schedule after that.
 *
 * @param {object} options
 * @param {string} options.dsn The project's DSN: scheme://publicKey@host/projectId.
 * @param {string} options.slug The monitor's slug.
 * @param {"in_progress" | "ok" | "error"} options.status
 * @param {string} options.checkInId Pairs a run's closing check-in with its
 *   in_progress one.
 * @param {object} options.monitorConfig Sentry's `monitor_config`.
 * @returns {Promise<CheckInResult>}
 */
export async function sendCheckIn({
  dsn,
  slug,
  status,
  checkInId,
  monitorConfig,
}) {
  const url = cronUrl(dsn, slug);
  if (!url)
    return { sent: false, summary: "The DSN isn't scheme://key@host/project" };

  // Errors are summed up here, never passed on: their messages can quote the
  // URL, and the URL holds the DSN's key.
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        check_in_id: checkInId,
        monitor_config: monitorConfig,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { sent: false, summary: "Sentry's ingest host didn't answer" };
  }
  return {
    sent: response.ok,
    summary: `Sentry answered ${response.status} to the ${status} check-in`,
  };
}

/** The monitor's check-in URL, or null when the DSN isn't a DSN. */
function cronUrl(dsn, slug) {
  let parsed;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }
  const { protocol, username, host, pathname } = parsed;
  const projectId = pathname.replace(/^\/+|\/+$/g, "");
  if (!username || !/^\d+$/.test(projectId)) return null;
  return `${protocol}//${host}/api/${projectId}/cron/${slug}/${username}/`;
}
