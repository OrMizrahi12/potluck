# Read production

Read production the way you'd read a failing test: each signal is evidence, and the report ends on a verdict for each. The read is **read-only** end to end: production keeps the state it had before you looked. Every source below is one you can read without writing: Vercel's deploy list and logs, GitHub's commit statuses, Sentry through its connection, and the live site by `GET`.

The production database stays out of reach: no connection string, no `vercel env pull`, no `psql`, no Neon branch from the root. What the database did shows up in the logs, in Sentry and in `/api/health`; read it there. Copying production data out is a one-way door (`docs/agents/what-stays-human.md`).

## 1. What's live, and since when

Use the Vercel CLI the setup scripts pin, scoped by the team's **ID**, never its name, and with no `vercel link`, which pulls the project's variables. The ID is the CLI's `currentTeam`:

```sh
V="npx --yes vercel@65.5.0"
S="--scope $(jq -r .currentTeam ~/.local/share/com.vercel.cli/config.json)"
$V ls potluck --environment production $S       # recent production deploys, newest first
$V inspect potluck-zeta.vercel.app $S           # the deploy behind the address: its id and created time
$V api /v13/deployments/<dpl_id> $S 2>/dev/null > <scratchpad>/live.json
jq '{meta: (.meta | with_entries(select(.key | test("Sha$|Ref$|Message$")))), ready: (.ready/1000 | todate), readyState}' <scratchpad>/live.json
```

The CLI prints its banner to stderr, so drop stderr (`2>/dev/null`) before any pipe into `jq`. The worktree sandbox refuses a command that names the `meta` commit-SHA key outright, so save the deploy to the scratchpad and match its keys by suffix, as above.

Done when you can name the live commit, whether it is `main`'s tip (`git rev-parse origin/main` after a `git fetch`), and when it went live (`ready`). A failed deploy in the list that a later `Ready` one replaced is history; one newer than the live deploy means `main` isn't live.

## 2. Commit statuses on `main`

```sh
gh api repos/{owner}/{repo}/commits/main/status --jq '{state, statuses: [.statuses[] | {context, state, description, updated_at}]}'
gh api repos/{owner}/{repo}/commits/main/check-runs --jq '.check_runs[] | {name, status, conclusion}'
```

Done when every status (`Vercel`, `Smoke test`) and check run (`Smoke test production`, `Type-check, lint and service tests`) has a state. `pending` means read again in a few minutes.

## 3. Errors in the logs

Hobby keeps one hour of runtime logs, and `--since 1h` already falls outside it: ask for `59m`.

```sh
$V logs --project potluck --environment production --since 59m --limit 1000 --query 'level:error' --json $S
$V logs requests --project potluck --environment production --since 59m --limit 1000 --query 'httpStatus >= 500' --json $S
```

Known noise, which reads as an error and is not one:

- `pg`'s "SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'". Node writes it to stderr, so it logs at error level. The fix is a production setting, so it's the human's.
- `Test error, thrown on purpose`, from `/api/test-error/g/…` on a deploy's own URL (`src/sentry/test-error.ts`).

Logs carry live group links in their paths (#37). Report a group path as `/g/<token>`, never the token itself.

Done when the summary line says `"hasMore":false` and every error line and 5xx request is either known noise or carried into the verdict.

## 4. Sentry

The Sentry MCP connection reads and never writes: it has no tool that resolves, assigns or ignores an issue. Resolving is a human's click in Sentry.

- `search_issues` with `is:unresolved project:potluck` lists the open issues (org `superposition-zi`).
- `get_issue_details` on each new one gives its stack, its `release` tag and its URL as Sentry stored it.

Done when each open issue has a verdict, and you've checked that its `release` is the live commit from step 1 or explained why not.

## 5. The live site

`GET` only: no form, no `POST`, no group created or opened. A group made on production is a stranger's to find (#34).

```sh
curl -s https://potluck-zeta.vercel.app/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://potluck-zeta.vercel.app/api/live
curl -s -o /dev/null -w '%{http_code}\n' https://potluck-zeta.vercel.app/
```

Done when all three answer `200`, and `/api/health` reports `"status":"ok"`, `schemaCurrent: true` and the live commit from step 1.

## 6. The verdict

Give every signal from steps 1 to 5 one of three verdicts:

- **Page**: it would wake a person now. Members can't open or save a group, `/api/health` fails, the live deploy isn't `main`'s tip after a merge, or a Sentry issue has real users in the live release.
- **Ticket**: real but able to wait for a working day, like the `pg` SSL warning.
- **Noise**: expected and needing nothing, like a test error or a failed deploy a later one replaced.

Done when the report names the live commit and when it went live, and gives each signal its verdict and evidence.
