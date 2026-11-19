import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { sentryBuildOptions, sentryDsn } from "./src/sentry/production";

// Sent with every response, before Proxy runs, so its 404 rewrite has them too
// (#89). No `script-src`: a nonce-based script policy makes every page render
// dynamically, which works against `cacheComponents`. A group link is the only
// way into its group, so no request may send it as a referrer.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    // Every powerful feature the app doesn't use, turned off.
    key: "Permissions-Policy",
    value: [
      "accelerometer",
      "autoplay",
      "bluetooth",
      "browsing-topics",
      "camera",
      "display-capture",
      "fullscreen",
      "geolocation",
      "gyroscope",
      "hid",
      "magnetometer",
      "microphone",
      "midi",
      "payment",
      "publickey-credentials-get",
      "screen-wake-lock",
      "serial",
      "usb",
      "xr-spatial-tracking",
    ]
      .map((feature) => `${feature}=()`)
      .join(", "),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Inlined into client and server: empty except in a production build.
  env: { POTLUCK_SENTRY_DSN: sentryDsn(process.env) ?? "" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, sentryBuildOptions(process.env));
