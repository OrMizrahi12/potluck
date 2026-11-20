# Running production

What to do when production breaks or hits a plan limit. The words (deploy, release, rollback, backup, restore, incident) are defined in `GLOSSARY.md`, under _Running Potluck_. Spec #63 is where these decisions come from.

## Where alerts come from

| Source                                               | Watches                                                                                                       | Reaches you as                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sentry uptime monitor, every 5 minutes               | `/api/live`, which never touches the database: is the production address serving at all?                      | Sentry alert email                                                      |
| Hourly health check (`.github/workflows/health.yml`) | `/api/health`: database answers, every migration applied, storage under 80% of Neon's 1 GB                    | An open issue, "Production health check failing", assigned to the owner |
| Sentry cron monitor `potluck-nightly-backup`         | The nightly backup (`.github/workflows/backup.yml`): a failed run, or no check-in within 3 hours of 03:23 UTC | Sentry alert email                                                      |
| Smoke test (`.github/workflows/smoke.yml`)           | Each release of `main`, after it's released: a failure holds nothing back yet                                 | A failed "Smoke test" status on the commit                              |

The backup job creates its cron monitor on its first check-in. Until the job has run once from `main`, there's no monitor, and nothing alerts about backups.

## Plan limits

Nothing responds to a limit automatically. Each row is a person's job.

| Plan           | Limit                                                                    | What you see                                                                                                                         | What you do                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby   | 1M invocations, 4 active CPU-h, 100 GB transfer a month                  | The uptime monitor alerts; production is paused and answers 503. Vercel may not warn first.                                          | Open an incident. Read the Vercel dashboard's usage page and unpause by hand if it lets you; otherwise the pause lasts until the 30-day window resets (ADR 0001; which one applies is unverified, #63). Look for abuse: the Vercel Firewall rule "Rate limit writes" answers 429 past 20 POSTs a minute per IP (#12). |
| Vercel Hobby   | Runtime logs kept 1 hour, no drains                                      | Logs hold `/g/<token>` paths; anything older than an hour is gone                                                                    | Nothing: accepted (ADR 0005). Read logs within the hour, or reproduce. Never add a drain that keeps `/g/` requests.                                                                                                                                                                                                   |
| Vercel Hobby   | Non-commercial terms                                                     | Nothing, until Vercel acts                                                                                                           | Never monetize on Hobby (ADR 0001).                                                                                                                                                                                                                                                                                   |
| Neon Free      | 1 GB storage                                                             | The hourly health issue at 80%; at 100%, writes fail but reads and backups work                                                      | At 80%, find what's growing before it's full: per-group caps should hold, so a big group points at abuse.                                                                                                                                                                                                             |
| Neon Free      | 100 CU-h compute, 5 GB egress a month                                    | The hourly health issue; everything that reads the database fails, backups too. `/api/live` still answers.                           | Open an incident and wait for the month to turn. There's no fix on the free plan.                                                                                                                                                                                                                                     |
| Neon Free      | 10 branches                                                              | An 11th preview branch fails to create, so a PR's preview fails                                                                      | Keep at most 8 PRs with previews open (ADR 0003); close or merge one.                                                                                                                                                                                                                                                 |
| GitHub Actions | 500 MB artifacts; schedules may be dropped, and stop after 60 days quiet | Backups and health checks stop quietly. The Sentry cron monitor alerts on a missed backup; nothing alerts on a stopped health check. | Read the failed run. The backup job fails on purpose over 30 MB, to keep 14 copies under 500 MB: rethink retention before raising it. A stopped schedule: re-enable the workflow in the Actions tab. Now and then, check the health check's last run is under an hour old.                                            |
| Sentry free    | 5k errors a month, 1 uptime and 1 cron monitor                           | Errors past 5k are dropped                                                                                                           | Nothing: accepted. If it's hit, the errors already seen say what's wrong.                                                                                                                                                                                                                                             |

## Dependency updates

Dependabot opens one PR a week with every minor and patch update (`.github/dependabot.yml`). It ignores major versions, which can break the build (#91), so nothing announces them. Check for them on purpose, at least once a month and whenever a security alert's fix is a major:

```sh
npm outdated
```

A package whose `Latest` is a major past `Wanted` has a major waiting. Land each major as its own change, in its own worktree and PR, with whatever code it breaks fixed alongside.

## Rollback

When a release is broken:

1. A person runs `vercel rollback`. It moves the production address back one release and never touches the schema, which is why migrations only add.
2. Check the production address answers: `/api/live`, then `/api/health`.
3. Fix on a branch and release the fix through the normal path: a PR merged to `main`, then its smoke test.

Past one release back, fix forward. There's no rollback script.

## Incidents

An incident runs from the alert until the fix is released and a note is written. Write the note as a comment on the issue that tracked it (the health issue, or a new one):

```md
**Incident:** <one line: what users saw>
**From / to:** <alert time> → <fix released time> (UTC)
**Alert:** <which source above, or "a person noticed">
**Cause:** <what broke>
**Fix:** <rollback, PR #, or wait>
**Data lost:** <none, or what and why>
**Next time:** <one change that would have caught it sooner, or "nothing">
```

## Restore drill, every quarter

Restoring production is a person's job, never an agent's (`docs/agents/what-stays-human.md`): a restore overwrites production, and the only undo is another restore. The drill is a person's job too: it puts production data into a Neon branch, which is the door "copying production data out of the root branch".

Put a recurring reminder in your own calendar: **"Potluck restore drill"**, on the first Monday of January, April, July and October. Each drill follows [Restoring a backup](#restoring-a-backup) into a scratch Neon branch, never the root branch; checks that a group in it opens; deletes the branch the same day; and fixes the written steps if any step was wrong.

## Backups

Every night at 03:23 UTC, `.github/workflows/backup.yml` copies the root branch with `pg_dump`, encrypts the copy with `age`, and keeps it as a workflow artifact for 14 days (ADR 0004). Run it by hand from the Actions tab (Nightly backup → Run workflow, on `main`). It fails, and keeps nothing that night, if the backup is over 30 MB.

The backups are encrypted to the recipient in ADR 0004. Its private key is with the operator, offline: without it no backup can be opened, and anyone holding it can read 14 nights of production data. Changing the recipient changes ADR 0004 in the same PR; `npm run check` fails otherwise.

**Set up once** (a person; these are production secrets):

1. In GitHub, Settings → Environments → `production`: deployment branches limited to `main`, with two secrets:
   - `BACKUP_DATABASE_URL`: the root branch's direct connection string, from Neon's Connect dialog with connection pooling off (no `-pooler` in the host). `pg_dump` needs a session the pooler doesn't give.
   - `SENTRY_DSN`: the potluck project's DSN (Sentry → Settings → Projects → potluck → Client Keys).
2. Run the workflow once by hand. In Sentry, Monitors now lists `potluck-nightly-backup`.
3. Check an alert rule emails you on that monitor's issues (Monitors → Alerts). A missed or failed check-in opens an issue, so the "new issue" email from `scripts/setup-monitoring.sh` stage 1 covers it if it's still on.

## Restoring a backup

You need the private key, `gh` signed in, `age`, and `pg_restore` from PostgreSQL 18 or newer (the job copies with `pg_dump` 18, and `pg_restore` can't read a file from a newer `pg_dump` than itself). These steps restore into a **scratch branch**. Everything below puts production data on your machine: keep it in one private directory and delete it when done.

1. **Download the latest backup.**

   ```sh
   mkdir -m 700 ~/potluck-restore && cd ~/potluck-restore
   gh api 'repos/OrMizrahi12/potluck/actions/artifacts?per_page=100' \
     --jq '.artifacts[] | select((.name | startswith("potluck-2")) and (.expired | not)) | "\(.workflow_run.id) \(.name)"'
   run=<the run id beside the night you want; the newest is first>
   gh run download "$run" --repo OrMizrahi12/potluck --dir .
   ls */*.dump.age
   ```

   The list is by artifact, not by run, on purpose: a run marked failed only because its closing Sentry check-in failed still kept its backup.

2. **Decrypt it.**

   ```sh
   age --decrypt --identity /path/to/potluck-backup-key.txt --output potluck.dump potluck-*/potluck-*.dump.age
   pg_restore --list potluck.dump | head   # "Archive created at" is when the backup was made
   ```

3. **Make a scratch branch.** Neon console → Branches → New branch: name `restore-YYYY-MM-DD`, parent `development` (it holds only seed data, so what you see afterwards came from the backup). Copy its connection string with pooling off:

   ```sh
   read -rs SCRATCH_URL   # paste it; it isn't echoed
   export SCRATCH_URL
   ```

   Neon Free allows 10 branches; if this one won't create, close a PR's preview first (ADR 0003).

4. **Restore into it.** `--clean --if-exists` replaces the seed's tables with the backup's; `--single-transaction` means a failure leaves the branch as it was.

   ```sh
   pg_restore --clean --if-exists --no-owner --no-privileges \
     --single-transaction --exit-on-error --dbname="$SCRATCH_URL" potluck.dump
   ```

5. **Check it.** The counts should match production at the time of the backup, and the migrations table should hold every file in `drizzle/`:

   ```sh
   psql "$SCRATCH_URL" -c "select (select count(*) from groups) groups, (select count(*) from expenses) expenses, (select count(*) from drizzle.__drizzle_migrations) migrations"
   psql "$SCRATCH_URL" -Atc "select link_token from groups order by created_at desc limit 1"
   cd /path/to/your/potluck/checkout   # potluck.dump stays behind in ~/potluck-restore
   DATABASE_URL="$SCRATCH_URL" npm run dev
   ```

   `DATABASE_URL` set this way wins over the one in `.env.local`. Open `/g/<that token>` on the address `npm run dev` prints: the group, its members and expenses show.

6. **Clean up, the same day.** Stop the dev server, delete the `restore-…` branch in Neon's console, then:

   ```sh
   cd ~ && rm -rf ~/potluck-restore && unset SCRATCH_URL
   ```

   If a step was wrong, fix it here in a PR.

**Restoring production itself** is the same, with step 3's target the root branch, and it overwrites everything written since the backup. Within Neon's ~6-hour history, restore from that instead (Neon console → Restore), which loses less. Either way, open an incident first, and say in its note what was lost.
