# Potluck

A web app where a group splits shared expenses: who paid what, and who owes whom.

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

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run check`       | Everything CI runs: type-check, lint, dependency guard, tests   |
| `npm run typecheck`   | TypeScript                                                      |
| `npm run lint`        | ESLint                                                          |
| `npm test`            | Service tests, each on a fresh PGlite (Postgres 18) database    |
| `npm run db:generate` | Generate a SQL migration from `src/db/schema.ts` into `drizzle/` |
| `npm run db:migrate`  | Apply migrations, holding a Postgres advisory lock              |
| `npm run db:seed`     | Apply migrations and load the seed, the only source of data     |
