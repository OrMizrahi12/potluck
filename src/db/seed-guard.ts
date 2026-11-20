type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The host `pg` connects to: a `?host=` parameter (the last, when there are
 * several) wins over the URL's own, and a URL with neither falls back to
 * PGHOST. Undefined when it isn't a URL.
 */
function hostOf(env: Env, databaseUrl: string): string | undefined {
  if (!URL.canParse(databaseUrl)) return undefined;
  const url = new URL(databaseUrl);
  const hostParameter = url.searchParams.getAll("host").at(-1);
  return hostParameter || url.hostname || env.PGHOST || "";
}

/** No host means the default Unix socket; a path is a Unix socket. */
function isLocal(host: string): boolean {
  return host === "" || host.startsWith("/") || LOCAL_HOSTS.has(host);
}

/**
 * Refuses to seed production (#34). The seed creates groups at link tokens
 * published in the repo, so a seeded production hands strangers groups they
 * can write to, and deleting them later deletes what they wrote.
 *
 * It refuses outright when VERCEL_ENV is production, and refuses any database
 * that isn't local (a Unix socket, localhost or a loopback address) unless
 * POTLUCK_ALLOW_REMOTE_SEED=1 says the remote one is a Neon development branch.
 * A connection string it can't read counts as remote. It stops mistakes, not a
 * person who sets the variable and points it at production anyway.
 */
export function guardSeed(env: Env, databaseUrl: string): void {
  if (env.VERCEL_ENV === "production") {
    throw new Error("Refusing to seed: VERCEL_ENV is production.");
  }
  const host = hostOf(env, databaseUrl);
  if (host !== undefined && isLocal(host)) return;
  if (env.POTLUCK_ALLOW_REMOTE_SEED === "1") return;
  throw new Error(
    `Refusing to seed ${host ?? "a DATABASE_URL that isn't a URL"}: it isn't a local database. To seed a Neon development branch, set POTLUCK_ALLOW_REMOTE_SEED=1.`
  );
}
