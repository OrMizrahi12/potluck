// Fails if the nightly backup encrypts to anyone but the age recipient ADR
// 0004 records (#11). Whoever holds the matching private key can read every
// backup, so changing the recipient means changing the ADR too, in the same
// reviewed PR. `npm run check` runs it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WORKFLOW = ".github/workflows/backup.yml";
const ADR = "docs/adr/0004-nightly-backups-as-encrypted-artifacts.md";

/** An age X25519 recipient: "age1" and 58 bech32 characters. */
const RECIPIENT_PATTERN = /\bage1[02-9ac-hj-np-z]{58}\b/g;
/** Anything that starts like an age recipient, plugin ones included. */
const ANY_AGE1_PATTERN = /\bage1[a-z0-9]+/g;
/** age's options that choose who can decrypt. */
const DECRYPTER_FLAGS = new Set([
  "-r",
  "--recipient",
  "-R",
  "--recipients-file",
  "-i",
  "--identity",
  "-p",
  "--passphrase",
  "-j",
]);

/**
 * Passes only when ADR 0004 records exactly one recipient, the workflow's
 * AGE_RECIPIENT is that one, no other recipient appears in the workflow, and
 * every `age --encrypt` in it is given `--recipient "$AGE_RECIPIENT"` and
 * nothing else that chooses who can decrypt.
 *
 * @param {object} files
 * @param {string} files.workflow The backup workflow's text.
 * @param {string} files.adr ADR 0004's text.
 * @returns {{ passed: boolean, summary: string }}
 */
export function checkBackupRecipient({ workflow, adr }) {
  const fail = (summary) => ({ passed: false, summary });

  const recorded = [...new Set(adr.match(RECIPIENT_PATTERN))];
  if (recorded.length !== 1)
    return fail(
      `${ADR} should record exactly one age recipient, and records ${recorded.length}`
    );
  const [recipient] = recorded;

  const unrecorded = [...new Set(workflow.match(ANY_AGE1_PATTERN))].filter(
    (r) => r !== recipient
  );
  if (unrecorded.length > 0)
    return fail(
      `${WORKFLOW} encrypts to ${unrecorded.join(", ")}, which ${ADR} doesn't record`
    );

  const assigned = workflow.match(/^\s*AGE_RECIPIENT:\s*(\S*)\s*$/m)?.[1];
  if (assigned !== recipient)
    return fail(`${WORKFLOW} doesn't set AGE_RECIPIENT to ${recipient}`);

  const commands = ageEncryptCommands(workflow);
  if (commands.length === 0)
    return fail(`${WORKFLOW} has no \`age --encrypt\` to check`);
  for (const args of commands) {
    const chosen = args.flatMap((arg, i) =>
      DECRYPTER_FLAGS.has(arg) ? [`${arg} ${args[i + 1] ?? ""}`.trim()] : []
    );
    const allowed =
      chosen.length === 1 &&
      ['--recipient "$AGE_RECIPIENT"', '-r "$AGE_RECIPIENT"'].includes(
        chosen[0]
      );
    if (!allowed)
      return fail(
        `${WORKFLOW}'s age must be given --recipient "$AGE_RECIPIENT" and nothing else that chooses who can decrypt; it's given: ${chosen.join(", ") || "nothing"}`
      );
  }

  return {
    passed: true,
    summary: `Backups encrypt to ${recipient}, as ${ADR} records`,
  };
}

/** Each `age --encrypt` command's arguments, line continuations joined. */
function ageEncryptCommands(workflow) {
  return workflow
    .replace(/\\\n\s*/g, " ")
    .split("\n")
    .flatMap((line) => {
      const words = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
      const at = words.indexOf("age");
      if (at === -1) return [];
      const args = words.slice(at + 1);
      return args.includes("--encrypt") || args.includes("-e") ? [args] : [];
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL("..", import.meta.url);
  const result = checkBackupRecipient({
    workflow: readFileSync(new URL(WORKFLOW, root), "utf8"),
    adr: readFileSync(new URL(ADR, root), "utf8"),
  });
  console[result.passed ? "log" : "error"](result.summary);
  process.exit(result.passed ? 0 : 1);
}
