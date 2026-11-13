## Agent skills

- **Issue tracker**: GitHub Issues, through `gh`. Read `docs/agents/issue-tracker.md` before writing to it.
- **Triage labels**: the skills' defaults, unrenamed; the mapping is `docs/agents/triage-labels.md`.
- **Glossary and ADRs**: one context, `GLOSSARY.md` and `docs/adr/` at the root. Read `docs/agents/domain.md` before naming a domain concept or going against an ADR.
- **Landing a change**: one change per worktree and PR. Read `docs/agents/landing.md` before opening a PR or merging.
- **Dev server log**: the developer's `npm run dev` writes everything it prints to `.data/logs/dev-latest.log` in the checkout it runs from. Read it when debugging the app they're running.
