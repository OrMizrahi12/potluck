import { execFileSync } from "node:child_process";

type Env = Record<string, string | undefined>;

// Potluck deploys only from this repo's `main`, as GitHub triggers it.
const EXPECTED = {
  provider: "github",
  repo: "OrMizrahi12/potluck",
  branch: "main",
};

/** An empty variable counts as unset. */
function present(value: string | undefined): string | undefined {
  return value || undefined;
}

/**
 * Refuses a production build that GitHub didn't trigger from this repo's
 * `main`, before anything connects to production's database. That stops a CLI
 * upload from a laptop and a build of another branch, including a preview
 * released to production (it rebuilds with production's variables). It stops
 * mistakes, not a deliberately faked build.
 *
 * Preview builds and local runs pass untouched. The check fails closed: a
 * missing variable or a missing `.git` refuses, and so does a Vercel build
 * with its system variables switched off, since it can't say it isn't
 * production. `readHead` returns the checkout's `git rev-parse HEAD`, or
 * undefined when there's no `.git`; a CLI upload carries none, so metadata
 * passed with `vercel deploy -m` can't pass.
 *
 * Returns the line a passing production build prints to its log, so the log
 * shows the check ran, or undefined when the check doesn't apply.
 */
export function guardProductionBuild(
  env: Env,
  readHead: () => string | undefined
): string | undefined {
  const environment = present(env.VERCEL_ENV);
  if (environment === undefined && !env.VERCEL) return undefined;
  if (environment !== undefined && environment !== "production") {
    return undefined;
  }

  const owner = present(env.VERCEL_GIT_REPO_OWNER);
  const slug = present(env.VERCEL_GIT_REPO_SLUG);
  const seen = {
    provider: present(env.VERCEL_GIT_PROVIDER),
    repo: owner && slug ? `${owner}/${slug}` : undefined,
    branch: present(env.VERCEL_GIT_COMMIT_REF),
    commit: present(env.VERCEL_GIT_COMMIT_SHA),
    head: present(readHead()),
  };

  if (
    environment === "production" &&
    seen.provider === EXPECTED.provider &&
    seen.repo === EXPECTED.repo &&
    seen.branch === EXPECTED.branch &&
    seen.commit !== undefined &&
    seen.head === seen.commit
  ) {
    return `Production build source check passed: GitHub built ${EXPECTED.repo}'s ${EXPECTED.branch} at ${seen.commit}, and the checkout's HEAD matches.`;
  }

  // Only Git metadata is named: no connection string or other secret.
  const show = (value: string | undefined) => value ?? "(unset)";
  throw new Error(
    [
      `Refusing this production build: Potluck deploys only from a build GitHub triggered from ${EXPECTED.repo}'s ${EXPECTED.branch}. Nothing was migrated; the current release keeps serving.`,
      `Saw environment: ${show(environment)}, provider: ${show(seen.provider)}, repo: ${show(seen.repo)}, branch: ${show(seen.branch)}, commit: ${show(seen.commit)}, checkout HEAD: ${seen.head ?? "(no .git)"}.`,
    ].join("\n")
  );
}

/** The checkout's `git rev-parse HEAD`, or undefined with no `.git` or no git. */
export function readCheckoutHead(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}
