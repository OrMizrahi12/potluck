// Fails if a new migration under drizzle/ does more than add (#64). A
// rollback leaves the schema as it is, so the previous release must keep
// working on it: no renames, no type changes, no added or tightened
// constraints on an existing table, and no edits to a migration main already
// has. A drop passes only on its own, once the PR that stopped using what it
// drops is in the release production serves (the PR body says
// "Stops using: #N") and no code still names it. `npm run check` runs it
// against origin/main (MIGRATION_BASE overrides).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STOPS_USING = /^\s*Stops using:\s*#(\d+)\s*$/im;

/**
 * Passes when every new migration only adds, or when together they only drop
 * tables or columns that a released stop-using PR stopped reading and no
 * code still names.
 *
 * @param {object} input
 * @param {{ path: string, change: "added" | "modified" | "deleted", sql: string }[]} input.migrations
 *   The migration files that differ from main.
 * @param {() => Promise<string | null>} input.prBody This PR's body; asked only for a drop.
 * @param {object} input.github Asked only for a drop.
 * @param {(n: number) => Promise<{ merged: boolean, mergeCommit: string | null } | null>} input.github.pullRequest
 * @param {() => Promise<{ commit: string }>} input.github.productionRelease
 *   The commit of the release production serves now.
 * @param {(release: string, commit: string) => Promise<boolean>} input.github.includes
 *   Whether the release's commit includes the other commit.
 * @param {(word: string) => Promise<string[]>} input.codeMentions
 *   The code files that name a word.
 * @returns {Promise<{ passed: boolean, summary: string }>}
 */
export async function checkMigrations({
  migrations,
  prBody,
  github,
  codeMentions,
}) {
  const fail = (summary) => ({ passed: false, summary });

  const edited = migrations.find(({ change }) => change !== "added");
  if (edited)
    return fail(
      `${edited.path} is ${edited.change}, and main already has it. Production has run it; a change goes in a new migration`
    );

  const statements = migrations.flatMap(({ path, sql }) =>
    splitStatements(sql).map((text) => ({ path, text }))
  );
  const created = new Set(
    statements.flatMap(({ text }) => {
      const table = text.match(/^CREATE TABLE (?:IF NOT EXISTS )?(\S+)/i);
      return table ? [bare(table[1])] : [];
    })
  );
  const judged = statements.map((s) => ({ ...s, ...judge(s.text, created) }));

  const refused = judged.find((s) => s.kind === "refused");
  if (refused)
    return fail(`${refused.path} ${refused.reason}: ${refused.text}`);

  const drops = judged.filter((s) => s.kind === "drop");
  if (drops.length === 0)
    return { passed: true, summary: "Every new migration only adds" };
  if (drops.length < judged.length) {
    const other = judged.find((s) => s.kind !== "drop");
    return fail(
      `${other.path} adds alongside a drop. A drop goes in a PR of its own: ${other.text}`
    );
  }

  const named = (await prBody())?.match(STOPS_USING);
  if (!named)
    return fail(
      `${drops[0].path} drops something. A drop needs the PR body to name the PR that stopped using it ("Stops using: #N"), released to production first`
    );
  const pr = Number(named[1]);

  const stopUsing = await github.pullRequest(pr);
  if (!stopUsing?.merged)
    return fail(`#${pr}, named in "Stops using: #${pr}", isn't merged`);
  const release = await github.productionRelease();
  if (!(await github.includes(release.commit, stopUsing.mergeCommit)))
    return fail(
      `#${pr} isn't released yet: production serves ${release.commit}, which doesn't include #${pr}'s merge commit ${stopUsing.mergeCommit}`
    );

  for (const { word } of drops) {
    const files = await codeMentions(word);
    if (files.length > 0)
      return fail(
        `The code still names ${word}, which this PR drops: ${files.join(", ")}`
      );
  }
  return {
    passed: true,
    summary: `Every new migration only drops what #${pr} stopped using, and production has released #${pr}`,
  };
}

/**
 * Whether one statement only adds, drops a table or column (`word` names
 * it), or is refused (`reason` says why). Tables in `created` are new in
 * this PR, so no release reads them and constraints on them are free.
 */
function judge(text, created) {
  const adds = { kind: "adds" };
  const refuse = (reason) => ({ kind: "refused", reason });

  if (/\bRENAME\b/i.test(text)) return refuse("renames");

  const dropTable = text.match(/^DROP TABLE (?:IF EXISTS )?(\S+)$/i);
  if (dropTable) return { kind: "drop", word: bare(dropTable[1]) };

  if (/^CREATE (?:TABLE|TYPE|SEQUENCE|SCHEMA)\b/i.test(text)) return adds;
  if (/^CREATE INDEX\b/i.test(text)) return adds;
  const unique = text.match(
    /^CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?\S+ ON (?:ONLY )?(\S+)/i
  );
  if (unique)
    return created.has(bare(unique[1]))
      ? adds
      : refuse("adds a UNIQUE index to an existing table");
  if (/^ALTER TYPE \S+ ADD VALUE\b/i.test(text)) return adds;

  const alter = text.match(
    /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(\S+) (.+)$/i
  );
  if (!alter) return refuse("runs something the check can't read as adding");
  const isNew = created.has(bare(alter[1]));

  const judgedActions = splitTopLevel(alter[2]).map((action) =>
    judgeTableAction(action, isNew)
  );
  return (
    judgedActions.find((a) => a.kind === "refused") ??
    (judgedActions.every((a) => a.kind === "drop") && judgedActions.length === 1
      ? judgedActions[0]
      : judgedActions.find((a) => a.kind === "drop")
        ? refuse("drops alongside other changes in one statement")
        : adds)
  );
}

/** One action of an ALTER TABLE, judged like a statement. */
function judgeTableAction(action, isNew) {
  const adds = { kind: "adds" };
  const refuse = (reason) => ({ kind: "refused", reason });

  if (/^DROP (?:CONSTRAINT)\b/i.test(action))
    return refuse("drops a constraint");
  const column = action.match(/^DROP (?:COLUMN )?(?:IF EXISTS )?(\S+)/i);
  if (column) return { kind: "drop", word: bare(column[1]) };

  const addColumn = action.match(/^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(.+)$/i);
  if (
    addColumn &&
    !/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)\b/i.test(
      addColumn[1]
    )
  ) {
    if (isNew) return adds;
    const definition = addColumn[1];
    if (/\b(?:REFERENCES|CHECK|UNIQUE|PRIMARY KEY)\b/i.test(definition))
      return refuse("adds a column with a constraint to an existing table");
    if (/\bNOT NULL\b/i.test(definition) && !/\bDEFAULT\b/i.test(definition))
      return refuse(
        "adds a NOT NULL column without a default to an existing table"
      );
    return adds;
  }
  if (/^ADD\b/i.test(action))
    return isNew ? adds : refuse("adds a constraint to an existing table");

  const alterColumn = action.match(/^ALTER (?:COLUMN )?\S+ (.+)$/i);
  if (alterColumn) {
    if (/^SET DEFAULT\b/i.test(alterColumn[1])) return adds;
    if (isNew) return adds;
    if (/^SET NOT NULL$/i.test(alterColumn[1]))
      return refuse("makes an existing column NOT NULL");
    if (/^(?:SET DATA )?TYPE\b/i.test(alterColumn[1]))
      return refuse("changes a column's type");
  }
  return refuse("changes a table in a way the check can't read as adding");
}

/**
 * The SQL's statements, each on one line, without comments or Drizzle's
 * statement breakpoints. Semicolons inside quotes or dollar quotes don't
 * end a statement.
 */
function splitStatements(sql) {
  const statements = [];
  let current = "";
  for (let i = 0; i < sql.length;) {
    const rest = sql.slice(i);
    const quoted =
      rest.match(/^'(?:[^']|'')*'/) ??
      rest.match(/^"(?:[^"]|"")*"/) ??
      rest.match(/^(\$\w*\$)[\s\S]*?\1/);
    if (quoted) {
      current += quoted[0];
      i += quoted[0].length;
    } else if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (sql[i] === ";") {
      statements.push(current);
      current = "";
      i++;
    } else {
      current += sql[i];
      i++;
    }
  }
  statements.push(current);
  return statements.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** A list split at commas outside parentheses and quotes. */
function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const char of list) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** A name without its schema or double quotes: "public"."x" → x. */
function bare(name) {
  return name.split(".").at(-1).replace(/"/g, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkMigrations({
    migrations: changedMigrations(process.env.MIGRATION_BASE ?? "origin/main"),
    prBody: async () => {
      const branch =
        process.env.PR_BRANCH || run("git", ["branch", "--show-current"]);
      try {
        return run("gh", [
          "pr",
          "view",
          branch,
          "--json",
          "body",
          "-q",
          ".body",
        ]);
      } catch {
        return null;
      }
    },
    github: {
      pullRequest: async (n) => {
        const pr = JSON.parse(
          run("gh", ["pr", "view", String(n), "--json", "state,mergeCommit"])
        );
        return {
          merged: pr.state === "MERGED",
          mergeCommit: pr.mergeCommit?.oid ?? null,
        };
      },
      productionRelease: async () => {
        const deployments = JSON.parse(
          run("gh", [
            "api",
            "repos/{owner}/{repo}/deployments?environment=production&per_page=30",
          ])
        );
        for (const { id, sha } of deployments) {
          const [latest] = JSON.parse(
            run("gh", [
              "api",
              `repos/{owner}/{repo}/deployments/${id}/statuses?per_page=1`,
            ])
          );
          if (latest?.state === "success") return { commit: sha };
        }
        throw new Error(
          "None of production's last 30 deployments succeeded, so there's no release to compare with"
        );
      },
      includes: async (release, commit) => {
        const status = run("gh", [
          "api",
          `repos/{owner}/{repo}/compare/${commit}...${release}`,
          "-q",
          ".status",
        ]);
        return status === "ahead" || status === "identical";
      },
    },
    codeMentions: async (word) => {
      try {
        return run("git", [
          "grep",
          "-l",
          "-w",
          "-I",
          "-e",
          word,
          "--",
          "src",
          "scripts",
          "e2e",
          ":!scripts/check-migrations*",
        ]).split("\n");
      } catch (error) {
        if (error.status === 1) return [];
        throw error;
      }
    },
  });
  console[result.passed ? "log" : "error"](result.summary);
  process.exit(result.passed ? 0 : 1);
}

/**
 * The SQL migrations that differ from where this branch left `base`,
 * uncommitted and untracked ones included.
 */
function changedMigrations(base) {
  let since;
  try {
    since = run("git", ["merge-base", base, "HEAD"]);
  } catch {
    console.error(
      `Can't find ${base} to compare migrations with. Fetch it, or set MIGRATION_BASE.`
    );
    process.exit(1);
  }
  const CHANGES = { A: "added", M: "modified", D: "deleted" };
  const tracked = run("git", [
    "diff",
    "--name-status",
    "--no-renames",
    since,
    "--",
    "drizzle/",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { path, change: CHANGES[status[0]] ?? "modified" };
    });
  const untracked = run("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "drizzle/",
  ])
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, change: "added" }));
  return [...tracked, ...untracked]
    .filter(({ path }) => path.endsWith(".sql"))
    .map((m) => ({
      ...m,
      sql: existsSync(m.path) ? readFileSync(m.path, "utf8") : "",
    }));
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
