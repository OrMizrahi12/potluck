# Potluck

A web app where a group tracks shared expenses: who paid for what, and what each member must pay or receive to come out even.

## Local development

Needs Node 24 (`nvm use`), npm, and your own Postgres 18.

```sh
npm install
cp .env.example .env.local   # point DATABASE_URL at your local database
npm run db:seed              # applies migrations, then loads the fake data
npm run dev
```

`GET /api/health` answers without touching the database.

## Commands

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run check`       | Everything CI runs: type-check, lint, dependency guard, tests    |
| `npm run typecheck`   | TypeScript                                                       |
| `npm run lint`        | ESLint                                                           |
| `npm test`            | Service tests, each on a fresh PGlite (Postgres 18) database     |
| `npm run db:generate` | Generate a SQL migration from `src/db/schema.ts` into `drizzle/` |
| `npm run db:migrate`  | Apply migrations, holding a Postgres advisory lock               |
| `npm run db:seed`     | Apply migrations and load the seed, the only source of data      |

## Hosting

Vercel (Hobby) and Neon (Free, Postgres 18), both in Frankfurt. To set them up from scratch, run the wizard from the repo root; it walks you through every dashboard step:

```sh
scripts/setup-hosting.sh
```

| Environment | Database                                                            |
| ----------- | ------------------------------------------------------------------- |
| Local       | Your own Postgres 18, loaded by `npm run db:seed`                   |
| Preview     | Its own Neon branch, copied from `development` and deleted on merge |
| Production  | Neon's root branch, `production`; never seeded                      |

`development` holds only seed data and is Neon's default branch, so previews copy from it (see `docs/adr/0003-per-pr-database-copies.md`). Every Vercel build runs the migrations first (`vercel.json`), on the direct connection because the advisory lock needs a session; a failing migration fails the build.
