import * as Sentry from "@sentry/nextjs";
import { NOT_ERRORS, reportingOptions } from "./sentry/options";

// The server's error reporting. Only a production build has a DSN
// (src/sentry/production.ts, inlined by next.config.ts); without one, Sentry
// is never started, so nothing is sent.
export function register() {
  const dsn = process.env.POTLUCK_SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    ...reportingOptions(dsn),
    includeServerName: false,
    integrations: (defaults) =>
      defaults
        .filter((integration) => !NOT_ERRORS.has(integration.name))
        .filter((integration) => integration.name !== "Http")
        // As @sentry/nextjs sets it up, minus a session per request.
        .concat(
          Sentry.httpIntegration({
            disableIncomingRequestSpans: true,
            sessions: false,
          })
        ),
  });
}

export const onRequestError = Sentry.captureRequestError;
