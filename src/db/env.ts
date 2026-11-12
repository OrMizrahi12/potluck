export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local."
    );
  }
  return url;
}

/**
 * The connection string migrations run on. The advisory lock is held for a
 * whole session, which Neon's pooled endpoint (transaction pooling) can't
 * keep, so on Vercel migrations need the direct connection that Neon's
 * integration provides as DATABASE_URL_UNPOOLED. Locally DATABASE_URL is
 * already a direct connection.
 */
export function migrationDatabaseUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED;
  if (unpooled) return unpooled;
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Migrations need Neon's direct connection; check the Neon integration on this Vercel project."
    );
  }
  return databaseUrl();
}
