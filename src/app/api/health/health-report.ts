type Env = Record<string, string | undefined>;

export type HealthReport = {
  status: "ok";
  /** The commit this deploy was built from, or null outside a Vercel build. */
  commit: string | null;
};

/**
 * What `/api/health` answers. The smoke test waits until the production
 * address names the commit it was sent for, so it knows the release moved.
 * Vercel sets `VERCEL_GIT_COMMIT_SHA` at runtime too; a production build with
 * its system variables switched off is refused (`src/db/build-source.ts`).
 */
export function healthReport(env: Env): HealthReport {
  return { status: "ok", commit: env.VERCEL_GIT_COMMIT_SHA || null };
}
