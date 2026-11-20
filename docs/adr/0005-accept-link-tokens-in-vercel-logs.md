# Accept group link tokens in Vercel's runtime logs, and never export them

A group's link token is its only access control, and it sits in the URL path, `/g/<token>`. Vercel's runtime logs store each request's real path (its **Request Path**, not only the route pattern), searchable, so the logs hold a working link to every group opened. We accept that: on the Hobby plan the logs are kept for 1 hour, only the project's Vercel account can read them, and Hobby has no log drains. Vercel documents no setting that keeps a path out of its own runtime logs. (Vercel Runtime Logs and Drains docs, checked 2026-11-15; the findings are on #37.) Decided in #63, closing #37.

The rule that goes with it: **no log drain or other log export is added unless it filters out every `/g/` request.** That covers a Vercel log drain, any other service the logs are sent to, and any copy of them taken by hand or by a script. A drain can't rewrite a path, only send a request whole or drop it, so the filter drops `/g/` requests: sampling rules limited to other path prefixes, or an OData filter on `log/path` (which includes the query string) that excludes paths starting `/g/`. Sentry is not an exception: it already rewrites `/g/<token>` to `/g/[token]` before sending.

The alternative was carrying the token outside the path (`/g#<token>`, which browsers never send). That keeps it out of Vercel's logs entirely, but changes the link shape and breaks links already shared, a one-way door (`docs/agents/what-stays-human.md`). An hour of logs only the operator can read isn't worth that.

## Consequences

- Anyone signed in to the project's Vercel account can open any group seen in the last hour. Who has that access is part of the risk: keep the account to the operator.
- **Moving off Hobby lengthens the window, at once and for logs already stored:** Pro keeps runtime logs for 1 day, Pro with Observability Plus for 30 days, Enterprise for 3 days (30 with Observability Plus). A plan change revisits this ADR in the same PR or issue that decides it. Pro is also the plan that allows drains, so the rule above starts to bite there.
- A drain or export is a copy of production data leaving Vercel, the one-way door "copying production data out of the root branch". Its filter is checked by a person before it's turned on, and is a production setting, so no session adds one.
- Debugging production reads logs within the hour, or reproduces. Losing older logs is accepted (`docs/production.md`, plan limits).
- If the token ever moves out of the path, this ADR is superseded, not edited.
