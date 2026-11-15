/** Frankfurter v2, the rate source previews and Production ask. */
export const FRANKFURTER_URL = "https://api.frankfurter.dev/v2";

/**
 * The base URL rate lookups ask. Any Vercel deployment, preview or
 * Production, asks Frankfurter whatever the configuration says. Run locally,
 * it is `RATE_SOURCE_URL` when set, else the fake Potluck serves itself at
 * /api/fake-frankfurter/v2 on its own port, so local runs and browser tests
 * never reach Frankfurter.
 */
export function rateSourceUrl(env: Record<string, string | undefined>): string {
  if (env.VERCEL) return FRANKFURTER_URL;
  return (
    env.RATE_SOURCE_URL ??
    `http://localhost:${env.PORT ?? 3000}/api/fake-frankfurter/v2`
  );
}
