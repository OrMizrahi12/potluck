import { execFileSync } from "node:child_process";

type Env = Record<string, string | undefined>;

// Potluck deploys only from this repo's `main`, as GitHub triggers it.
const EXPECTED = {
  provider: "github",
  repo: "OrMizrahi12/potluck",
  branch: "main",
};

/**
 * Refuses a production build that GitHub didn't trigger from this repo's
 * `main`, before anything connects to production's database. That stops a CLI
 * upload from a laptop and a build of another branch, including a preview
 * promoted to production. It stops mistakes, not a deliberately faked build.
 *
 * Preview builds and local runs pass untouched. The check fails closed: a
 * missing variable or a missing `.git` refuses. `readHead` returns the
 * checkout's `git rev-parse HEAD`, or undefined when there's no `.git`; a CLI
 * upload carries none, so metadata passed with `vercel deploy -m` can't pass.
 */
export function guardProductionBuild(
  env: Env,
  readHead: () => string | undefined
): void {
  if (env.VERCEL_ENV !== "production") return;

  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  const seen = {
    provider: env.VERCEL_GIT_PROVIDER || undefined,
    repo: owner && slug ? `${owner}/${slug}` : undefined,
    branch: env.VERCEL_GIT_COMMIT_REF || undefined,
    commit: env.VERCEL_GIT_COMMIT_SHA || undefined,
    head: readHead() || undefined,
  };

  if (
    seen.provider === EXPECTED.provider &&
    seen.repo === EXPECTED.repo &&
    seen.branch === EXPECTED.branch &&
    seen.commit !== undefined &&
    seen.head === seen.commit
  ) {
    return;
  }

  // Only Git metadata is named: no connection string or other secret.
  const show = (value: string | undefined) => value ?? "(unset)";
  throw new Error(
    [
      `Refusing this production build: Potluck deploys only from a build GitHub triggered from ${EXPECTED.repo}'s ${EXPECTED.branch}. Nothing was migrated; the current release keeps serving.`,
      `Saw provider: ${show(seen.provider)}, repo: ${show(seen.repo)}, branch: ${show(seen.branch)}, commit: ${show(seen.commit)}, checkout HEAD: ${seen.head ?? "(no .git)"}.`,
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
