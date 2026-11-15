// `npm run dev`: runs `next dev` and copies everything it prints, stdout and
// stderr, to .data/logs/dev-latest.log, so agents can read what the developer's
// own terminal shows. The terminal keeps its colours; the log is plain text.
// The log masks group tokens: a group's link is its only access control, so
// every path under /g/ is written as /g/<token>; the terminal shows them whole.
// Each run starts the log afresh. It serves on the PORT in .env.local, which a
// worktree gets from `npm run setup:worktree`, else on 3000; --port overrides.
import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { constants } from "node:os";
import path from "node:path";
import { parseEnv, stripVTControlCharacters } from "node:util";

const root = path.join(import.meta.dirname, "..");
const logDir = path.join(root, ".data", "logs");
mkdirSync(logDir, { recursive: true });
const log = createWriteStream(path.join(logDir, "dev-latest.log"));

const envFile = path.join(root, ".env.local");
const port = existsSync(envFile)
  ? parseEnv(readFileSync(envFile, "utf8")).PORT
  : undefined;
const env = {
  ...process.env,
  ...(port && !process.env.PORT && { PORT: port }),
};

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "dev", ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    // Next turns colour off when its output is a pipe; keep it for a terminal.
    env: process.stdout.isTTY ? { ...env, FORCE_COLOR: "1" } : env,
  }
);

// Clean the log per whole line, so a colour code or a token split across
// chunks can't leak into it.
function cleanLogLine(line) {
  return stripVTControlCharacters(line).replace(
    /\/g\/[^\s?#/]+/g,
    "/g/<token>"
  );
}

let pending = "";
function toLog(text) {
  const lines = (pending + text).split("\n");
  pending = lines.pop() ?? "";
  for (const line of lines) log.write(cleanLogLine(line) + "\n");
}

for (const [from, to] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  from.setEncoding("utf8");
  from.on("data", (text) => {
    to.write(text);
    toLog(text);
  });
}

// Ctrl+C reaches `next dev` directly from the terminal; wait for it to finish.
process.on("SIGINT", () => {});
for (const signal of ["SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (pending) log.write(cleanLogLine(pending) + "\n");
  // A shell reports death by signal N as exit code 128 + N.
  log.end(() =>
    process.exit(signal ? 128 + constants.signals[signal] : (code ?? 1))
  );
});
