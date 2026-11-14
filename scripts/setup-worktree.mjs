// `npm run setup:worktree`: makes a fresh worktree ready to work in, so
// sessions in side-by-side worktrees don't collide. Safe to run again.
//
// 1. Installs dependencies, which also points git's pre-commit hook at them.
// 2. Gives the worktree its own local database, `potluck_<worktree name>`,
//    migrated and seeded.
// 3. Gives it its own dev server port, from 3100 up.
//
// Both land in `.env.local`, which `npm run dev`, the db scripts and Playwright
// read. Claude Code copies `.env.local` in from the main checkout (see
// `.worktreeinclude`); without one, `.env.example` is the start.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { parseEnv } from "node:util";

const root = path.join(import.meta.dirname, "..");
const envFile = path.join(root, ".env.local");
const FIRST_PORT = 3100;

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const gitDir = path.resolve(root, git("rev-parse", "--git-dir"));
const commonDir = path.resolve(root, git("rev-parse", "--git-common-dir"));
if (gitDir === commonDir) {
  console.error(
    "This is the main checkout, not a worktree: it keeps the `potluck` database and port 3000."
  );
  process.exit(1);
}

// 1. Dependencies. `npm install` also runs husky, which points git at this
// worktree's .husky/_; without it the pre-commit hook silently doesn't run.
execFileSync("npm", ["install"], { cwd: root, stdio: "inherit" });

// 2. and 3. The database and the port, kept in .env.local once both exist.
if (!existsSync(envFile)) {
  copyFileSync(path.join(root, ".env.example"), envFile);
}
const localEnv = parseEnv(readFileSync(envFile, "utf8"));

const database = databaseNameFor(path.basename(root));
const databaseUrl = new URL(localEnv.DATABASE_URL);
databaseUrl.pathname = `/${database}`;
await createDatabase(databaseUrl, database);
execFileSync("npm", ["run", "db:seed"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl.href },
});

// A PORT copied in from the main checkout is the developer's, below 3100.
const port = await claimPort(Math.max(Number(localEnv.PORT) || 0, FIRST_PORT));
writeEnv({ DATABASE_URL: databaseUrl.href, PORT: String(port) });

console.log(
  `\nWorktree ready: database ${database}, dev server on port ${port}.` +
    `\n\`npm run dev\` serves http://localhost:${port}; \`npm run test:e2e\` tests it.`
);

/** `potluck_` and the worktree's name as a Postgres name: [a-z0-9_], at most 63 characters. */
function databaseNameFor(worktreeName) {
  const slug = worktreeName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `potluck_${slug}`.slice(0, 63);
}

/**
 * Claims the first free port from `preferred` up, for this worktree. A claim
 * is a file named after the port in the shared git directory, holding the
 * worktree's path; creating it fails if it exists, so two worktrees set up at
 * once can't take the same port. A claim whose worktree is gone is moved
 * aside, which only one setup can do, and then claimed afresh. A port
 * something already listens on is skipped.
 */
async function claimPort(preferred) {
  const claims = path.join(commonDir, "potluck-ports");
  mkdirSync(claims, { recursive: true });
  for (let candidate = preferred; candidate < 65536; candidate++) {
    const claim = path.join(claims, String(candidate));
    const holder = existsSync(claim) ? readFileSync(claim, "utf8") : null;
    if (holder === root) return candidate;
    if (holder !== null && !existsSync(holder)) {
      try {
        renameSync(claim, `${claim}.stale-${process.pid}`);
        rmSync(`${claim}.stale-${process.pid}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (!(await isFree(candidate))) continue;
    try {
      writeFileSync(claim, root, { flag: "wx" });
      return candidate;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("No free port to claim.");
}

/** Whether nothing listens on this port, tried the way `next dev` binds it. */
function isFree(candidate) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(candidate);
  });
}

/** Sets these keys in .env.local, keeping every other line as it is. */
function writeEnv(values) {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const index = lines.findIndex((existing) => existing.startsWith(`${key}=`));
    if (index === -1)
      lines.splice(lines.at(-1) === "" ? -1 : lines.length, 0, line);
    else lines[index] = line;
  }
  writeFileSync(envFile, lines.join("\n"));
}

/** Creates the database unless it exists, through the server's `postgres` database. */
async function createDatabase(url, name) {
  const { default: pg } = await import("pg");
  const postgresDbUrl = new URL(url);
  postgresDbUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: postgresDbUrl.href });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name]
    );
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
