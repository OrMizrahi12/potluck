# Back up nightly to GitHub Actions artifacts, encrypted to one offline key

Every night a GitHub Actions job (`.github/workflows/backup.yml`) copies production's root branch with `pg_dump`, encrypts the copy with `age` to one public recipient, and keeps it as a workflow artifact for 14 days. The private key that opens the backups is kept offline by the operator, never in GitHub, Vercel, Neon or the repo. The job fails if a backup is over 30 MB, so 14 copies stay under the free plan's 500 MB artifact quota, and it checks in to a Sentry cron monitor, so a failed or missing run alerts.

The recipient is `age1xuj79lu0v2u23aagqgw493l4utdsxezf2pt6m3n2f45m7cycu5zsdgsnvx`. `npm run check` fails if the workflow encrypts to any other.

This reverses #11's earlier "artifacts ruled out". Artifacts were ruled out because this repo is public, so anyone can download its artifacts. We accept that now because what they download is ciphertext, and it costs nothing, needs no other service and no other secret, and runs with the repo. Neon's own history (about 6 hours, ADR 0002) stays the first way back from a recent mistake; these backups are for losing the database, or noticing too late. Decided in #63.

_Goes against spec #1's "production data is never copied anywhere"_, on purpose: a backup has to be a copy kept outside the database. The exception is this one copy, encrypted before it leaves the job, readable only by the key's holder. Previews still never hold production data (ADR 0003).

## Consequences

- Anyone can download the encrypted backups. They stay safe only while `age` holds and the private key stays private.
- A leaked private key exposes every backup still kept: 14 nights of production data. Rotating means a new key pair, this ADR and the workflow changed in one PR, and the old artifacts deleted by hand.
- A lost private key means no backups: nothing kept can be opened. The operator keeps the key somewhere that outlives their own machine.
- The recipient decides who can read production data, so changing it is a one-way door (`docs/agents/what-stays-human.md`): the same PR changes this ADR, and a person merges it.
- The job reads production with its own connection string, `BACKUP_DATABASE_URL`, kept in the GitHub `production` environment that only `main` can use, so a pull request's workflow can't read it.
- Restoring is a person's job, written in `docs/production.md`, and drilled each quarter into a scratch Neon branch, never the root.
- Past 30 MB the job fails and keeps nothing that night. Before raising the limit, cut retention so 14 copies (or however many) still fit in 500 MB.
- GitHub may delay or drop a scheduled run, and switches schedules off after 60 days without repo activity; the Sentry monitor alerts on a missed check-in after a 3-hour margin.
