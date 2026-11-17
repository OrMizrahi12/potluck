// How `npm run dev` (scripts/dev.mjs) cleans a line before writing it to
// .data/logs/dev-latest.log: plain text, with group tokens masked. A group's
// link is its only access control, so the log writes every path under /g/ as
// /g/<token>, and the token a group-scoped server function takes as its first
// argument as "<token>". Next prints a server-function call as, for example:
//   └─ ƒ addExpenseAction("…", {}) in 31ms src/app/g/[token]/expenses/new/actions.ts
import { stripVTControlCharacters } from "node:util";

/** A server-function call's name and first argument, a JSON string. */
const SERVER_FUNCTION_FIRST_ARG = /(ƒ [\w$]+\()"(?:[^"\\]|\\.)*"/;
/** Where the group-scoped server functions live. */
const GROUP_SCOPED_SOURCE = /\/g\/\[token\]\//;

/**
 * @param {string} line One whole line of what `next dev` prints.
 * @returns {string} The line as the log records it.
 */
export function cleanLogLine(line) {
  let clean = stripVTControlCharacters(line);
  if (GROUP_SCOPED_SOURCE.test(clean)) {
    clean = clean.replace(SERVER_FUNCTION_FIRST_ARG, '$1"<token>"');
  }
  return clean.replace(/\/g\/[^\s?#/]+/g, "/g/<token>");
}
