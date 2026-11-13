# Landing a change

One change, one worktree, one PR. Each ticket or fix gets its own worktree and branch; never mix two changes in one PR.

`main` is guarded by the "Protect main" ruleset: changes arrive only through a PR, and the required check `Type-check, lint and service tests` must be green on a branch that is up to date with `main`.

## Steps

1. **Open the PR.** Write the body with `/pr`. When the change has a ticket, the body includes `Closes #N` so the merge closes it.
2. **Queue auto-merge**, right after opening: `gh pr merge --auto --merge`. GitHub merges once the required check is green. Done when `gh pr view --json autoMergeRequest` is non-null.
   - **Migration PRs are the exception.** A PR that adds a file under `drizzle/` is left for a human to merge: skip auto-merge and say in the PR that it carries a migration. Check with `gh pr diff --name-only | grep '^drizzle/'`.
3. **Keep the branch current.** When the PR is behind `main`, run `gh pr update-branch`; the check reruns and auto-merge proceeds.
4. **Confirm the deploy.** After the merge, read the production deploy of the merge commit. Vercel posts it as a commit status:

   ```sh
   sha=$(gh pr view <N> --json mergeCommit --jq .mergeCommit.oid)
   gh api repos/{owner}/{repo}/commits/$sha/status \
     --jq '.statuses[] | select(.context | test("vercel"; "i")) | {context, state, target_url}'
   ```

   Done when the status is `success` (report the `target_url`) or `failure`/`error` (report it and stop). `pending` means wait and read again.

## Guardrails

`.claude/settings.json` denies force-pushes, pushes to `main`, and `git reset --hard`. History on shared branches only moves forward; to undo a change, land a revert PR.
