import * as Sentry from "@sentry/nextjs";
import { NOT_ERRORS, reportingOptions } from "./sentry/options";

// The browser's error reporting. Only a production build has a DSN
// (src/sentry/production.ts, inlined by next.config.ts); without one, Sentry
// is never started, so nothing is sent.
const dsn = process.env.POTLUCK_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...reportingOptions(dsn),
    integrations: (defaults) =>
      defaults.filter((integration) => !NOT_ERRORS.has(integration.name)),
  });
}
