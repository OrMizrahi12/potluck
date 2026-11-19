import type { SentryBuildOptions } from "@sentry/nextjs/config";

type Env = Record<string, string | undefined>;

// Sentry's Vercel integration sets NEXT_PUBLIC_SENTRY_DSN, and SENTRY_AUTH_TOKEN,
// SENTRY_ORG and SENTRY_PROJECT for source maps, possibly in every Vercel
// environment. Only a production build uses them: a preview or a local run
// sends nothing to Sentry, whatever it has set.

function isProductionBuild(env: Env): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * The DSN this build reports errors to, or undefined when it reports none.
 * Read at build time (next.config.ts), since the browser can't read
 * `VERCEL_ENV`.
 */
export function sentryDsn(env: Env): string | undefined {
  if (!isProductionBuild(env)) return undefined;
  return env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

/**
 * `withSentryConfig`'s options. A production build uploads its source maps and
 * creates a release. Any other build does neither and is never handed the auth
 * token. The plugin never sends Sentry its own telemetry.
 */
export function sentryBuildOptions(env: Env): SentryBuildOptions {
  const production = isProductionBuild(env);
  return {
    authToken: production ? env.SENTRY_AUTH_TOKEN : undefined,
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    sourcemaps: { disable: !production },
    release: { create: production },
    telemetry: false,
    silent: !production,
    // Errors only: no tracing, no replays, no debug logging in the bundle.
    bundleSizeOptimizations: {
      excludeTracing: true,
      excludeReplayIframe: true,
      excludeReplayShadowDom: true,
      excludeReplayWorker: true,
      excludeDebugStatements: true,
    },
  };
}
