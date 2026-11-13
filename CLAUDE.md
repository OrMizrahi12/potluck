## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Landing a change

One worktree, one PR, auto-merge on green; migrations wait for a human. Read `docs/agents/landing.md` before opening a PR or merging.

**Dev server logs**: the developer runs `npm run dev` in their own terminal, and everything it prints goes to `.data/logs/dev-latest.log` (rewritten each run); read it when debugging the running app.
