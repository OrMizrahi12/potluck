# Running production

What to do when production breaks or hits a plan limit. The words (deploy, release, rollback, backup, restore, incident) are defined in `GLOSSARY.md`, under _Running Potluck_. Spec #63 is where these decisions come from.

## Where alerts come from

| Source                                               | Watches                                                                                    | Reaches you as                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Sentry uptime monitor, every 5 minutes               | `/api/live`, which never touches the database: is the production address serving at all?   | Sentry alert email                                                      |
| Hourly health check (`.github/workflows/health.yml`) | `/api/health`: database answers, every migration applied, storage under 80% of Neon's 1 GB | An open issue, "Production health check failing", assigned to the owner |
| Sentry cron monitor                                  | The nightly backup's check-in; a missed one alerts                                         | Sentry alert email                                                      |
| Smoke test (`.github/workflows/smoke.yml`)           | Each release of `main`, after it's released: a failure holds nothing back yet              | A failed "Smoke test" status on the commit                              |

The backup and its cron monitor arrive with #11. Until then there are no backups, and nothing alerts about them.

## Plan limits

Nothing responds to a limit automatically. Each row is a person's job.

| Plan           | Limit                                                                    | What you see                                                                                                                                          | What you do                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel Hobby   | 1M invocations, 4 active CPU-h, 100 GB transfer a month                  | The uptime monitor alerts; production is paused and answers 503. Vercel may not warn first.                                                           | Open an incident. Read the Vercel dashboard's usage page and unpause by hand if it lets you; otherwise the pause lasts until the 30-day window resets (ADR 0001; which one applies is unverified, #63). Look for abuse: the write rate limit that would stop it is still owed (#12). |
| Vercel Hobby   | Runtime logs kept 1 hour, no drains                                      | Logs hold `/g/<token>` paths; anything older than an hour is gone                                                                                     | Nothing: accepted (#37). Read logs within the hour, or reproduce.                                                                                                                                                                                                                    |
| Vercel Hobby   | Non-commercial terms                                                     | Nothing, until Vercel acts                                                                                                                            | Never monetize on Hobby (ADR 0001).                                                                                                                                                                                                                                                  |
| Neon Free      | 1 GB storage                                                             | The hourly health issue at 80%; at 100%, writes fail but reads and backups work                                                                       | At 80%, find what's growing before it's full: per-group caps should hold, so a big group points at abuse.                                                                                                                                                                            |
| Neon Free      | 100 CU-h compute, 5 GB egress a month                                    | The hourly health issue; everything that reads the database fails, backups too. `/api/live` still answers.                                            | Open an incident and wait for the month to turn. There's no fix on the free plan.                                                                                                                                                                                                    |
| Neon Free      | 10 branches                                                              | An 11th preview branch fails to create, so a PR's preview fails                                                                                       | Keep at most 8 PRs with previews open (ADR 0003); close or merge one.                                                                                                                                                                                                                |
| GitHub Actions | 500 MB artifacts; schedules may be dropped, and stop after 60 days quiet | Backups and health checks stop quietly. The Sentry cron monitor alerts on a missed backup (once #11 lands); nothing alerts on a stopped health check. | Read the failed run. The backup job fails on purpose over 30 MB, to keep 14 copies under 500 MB: rethink retention before raising it. A stopped schedule: re-enable the workflow in the Actions tab. Now and then, check the health check's last run is under an hour old.           |
| Sentry free    | 5k errors a month, 1 uptime and 1 cron monitor                           | Errors past 5k are dropped                                                                                                                            | Nothing: accepted. If it's hit, the errors already seen say what's wrong.                                                                                                                                                                                                            |

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

Put a recurring reminder in your own calendar: **"Potluck restore drill"**, on the first Monday of January, April, July and October. Each drill loads the latest backup into a scratch Neon branch, never the root branch; checks that a group in it opens; deletes the branch the same day; and fixes the written steps if any step was wrong. The steps arrive with #11. Until #11 lands there's nothing to drill.
