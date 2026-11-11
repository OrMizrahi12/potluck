# Each pull request gets its own database copy, never production data

Every pull request's preview deployment gets its own Neon branch, copied from a `development` branch that holds only data from the repo's seed script, and deleted when the PR merges. Neon's Vercel integration does this, and it always copies from the project's default branch, so `development` is the default branch.

Production stays on Neon's root branch. Neon Free has no protected branches, and any branch with a parent can be "reset from parent", which would overwrite it; the root has no parent and can't be deleted. `development` was created from the root while the root was still empty, before launch, so no real data was ever copied into it.

We rejected a single shared preview database because PRs would trample each other's schema and data, and we rejected copying production because previews must never hold real people's data.

## Consequences

- Neon Free's 10-branch limit leaves room for 8 open PRs with previews at once.
- If production goes 24 hours without traffic, Neon may archive it; it comes back on the next connection, more slowly.
