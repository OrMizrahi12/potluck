import { scrubBreadcrumb, scrubErrorReport } from "./scrub";

/**
 * What `Sentry.init` is given on client and server, besides the integrations.
 * Errors only: no `tracesSampleRate`, so no tracing, and no replay integration.
 * The SDK collects no user info, cookies, headers, bodies, query strings, local
 * variables or database query data, and the scrubbers rewrite every link
 * token before an error report or breadcrumb leaves.
 */
export function reportingOptions(dsn: string) {
  return {
    dsn,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
    },
    sendClientReports: false,
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/**
 * Default integrations that would send Sentry something besides errors:
 * release-health sessions, and the browser's tracing.
 */
export const NOT_ERRORS = new Set([
  "BrowserSession",
  "BrowserTracing",
  "ProcessSession",
]);
