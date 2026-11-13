---
name: verify
description: Check a change in the running Potluck app and commit screenshots a reviewer can see. Use when a change alters what a page shows or does, before its PR opens, or when a PR's Evidence needs screenshots.
---

# Verify

A change is verified when a browser test walks it in the running app, has gone **red** once and is now green on desktop and phone, and the screenshots it took are committed for the PR. The test is the verification: it stays in `e2e/` as the regression guard.

## 1. Run the app from this worktree

The server on port 3000 is the developer's, serving whichever checkout they started it from, not your change. Start your own:

```sh
npm install                     # a fresh worktree has no node_modules
cp -n .env.example .env.local   # .env* is gitignored, so the worktree has none
npm run db:migrate              # the local `potluck` database is shared by every checkout
npm run dev -- --port 3100      # in the background
```

Your server logs to this worktree's `.data/logs/dev-latest.log`.

Done when `curl -s -o /dev/null -w '%{http_code}' localhost:3100/api/health` prints `200`.

## 2. Write the walk

Add or extend a spec in `e2e/`: one `test.step` per thing a member does, named in `GLOSSARY.md`'s words. Build on `e2e/create-group.spec.ts`. Its `screenshot`, `watchForErrors` and `expectNoSidewaysScroll` helpers set the bar every page meets: no browser errors, nothing scrolling sideways. When a second spec needs them, move them to `e2e/helpers.ts`.

Take a screenshot at each state a reviewer should see (the form filled in, the result, the page someone else opens), named `<n>-<state>` so they sort in walk order.

Done when the walk reaches the change's outcome and asserts it by role and label; a screenshot alone asserts nothing.

## 3. Watch it go red, then green

```sh
BASE_URL=http://localhost:3100 npm run test:e2e -- e2e/<spec>.ts
```

Make it **red** once: run it before the change exists, or break the one expectation that proves the change and restore it (#16 expected the members in the wrong order). Then make it green.

Done when both projects, `desktop` and `phone`, pass, and `grep -nE '⨯|Error|Warning' .data/logs/dev-latest.log` finds nothing from your run. Server errors land only in that log, browser errors only in `watchForErrors`: check both.

## 4. Look at every screenshot

Playwright empties `test-results/` at the start of each run, so look after the final green run. Open each `test-results/*/<n>-<state>.png` with Read: a green test can still show overlapping text, a clipped field, or a red issue count on Next's dev badge (the round "N", bottom left). Fix what you see and go back to step 3.

Done when you have seen every screenshot of the final run and each shows what its name says.

## 5. Commit the evidence

Copy the screenshots that show the change, desktop and phone, to `docs/evidence/issue-<N>/<project>-<n>-<state>.png` (the branch name stands in for `issue-<N>` when there's no ticket). Commit them on their own: `Add screenshots of #<N>'s browser test for the PR`.

## 6. Hand the evidence to the PR

The Evidence section of the PR body (written with `/pr`) embeds the images by the evidence commit's SHA, so they outlive the branch. The URLs resolve once that commit is pushed.

```md
| Desktop: <state>                                                                                                                  | Phone: <state>                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/OrMizrahi12/potluck/<sha>/docs/evidence/issue-<N>/desktop-1-<state>.png" width="320"> | <img src="https://raw.githubusercontent.com/OrMizrahi12/potluck/<sha>/docs/evidence/issue-<N>/phone-1-<state>.png" width="150"> |
```

Beside the table: the test's pass lines, one line on how it went red, and under **Not covered** what the walk can't reach. Headless Chromium has no share sheet and isn't a real phone, and CI runs no browser tests until #12 closes.

## 7. Stop your server

Stop the dev server you started in step 1, and only that one.

Done when `localhost:3100/api/health` no longer answers.
