import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { sentryBuildOptions, sentryDsn } from "./src/sentry/production";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Inlined into client and server: empty except in a production build.
  env: { POTLUCK_SENTRY_DSN: sentryDsn(process.env) ?? "" },
};

export default withSentryConfig(nextConfig, sentryBuildOptions(process.env));
