import { describe, expect, test } from "vitest";
import { cleanLogLine } from "./clean-log-line.mjs";

const TOKEN = "Zx3kQ9vT_bN2-pLm8aRw1A";

describe("cleanLogLine", () => {
  test("masks a group token in a request path", () => {
    expect(cleanLogLine(` GET /g/${TOKEN}?probe=1 200 in 40ms`)).toBe(
      " GET /g/<token>?probe=1 200 in 40ms"
    );
  });

  test("masks a group token passed to a group-scoped server function", () => {
    expect(
      cleanLogLine(
        `  └─ ƒ addExpenseAction("${TOKEN}", {}) in 31ms src/app/g/[token]/expenses/new/actions.ts`
      )
    ).toBe(
      '  └─ ƒ addExpenseAction("<token>", {}) in 31ms src/app/g/<token>/expenses/new/actions.ts'
    );
  });

  test("keeps a group-scoped server function's other arguments", () => {
    expect(
      cleanLogLine(
        `  └─ ƒ deleteExpenseAction("${TOKEN}", "e1b2c3", 2) in 12ms src/app/g/[token]/expenses/[id]/actions.ts`
      )
    ).toBe(
      '  └─ ƒ deleteExpenseAction("<token>", "e1b2c3", 2) in 12ms src/app/g/<token>/expenses/[id]/actions.ts'
    );
  });

  test("keeps the arguments of a server function outside a group", () => {
    const line = "  └─ ƒ createGroupAction({}, {}) in 52ms src/app/actions.ts";
    expect(cleanLogLine(line)).toBe(line);
  });

  test("strips colour codes", () => {
    expect(cleanLogLine("\u001b[32m GET / 200\u001b[39m")).toBe(" GET / 200");
  });
});
