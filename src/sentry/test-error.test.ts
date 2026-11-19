import { describe, expect, it } from "vitest";
import { answerTestError } from "./test-error";

const PATH = "/api/test-error/g/SentryTestNotARealLink";
// What Vercel sets on a production deploy: its own URL, behind deployment
// protection, and the public production address.
const ENV = {
  VERCEL_URL: "potluck-abc123def-potluck.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
};

describe("the test error", () => {
  it("is thrown on the deploy's own URL", () => {
    const request = new Request(
      `https://potluck-abc123def-potluck.vercel.app${PATH}`
    );
    expect(() => answerTestError(request, ENV)).toThrow(
      "Test error, thrown on purpose at /api/test-error/g/SentryTestNotARealLink"
    );
  });

  it("is a 404 on the public production address", () => {
    const request = new Request(`https://potluck-zeta.vercel.app${PATH}`);
    expect(answerTestError(request, ENV).status).toBe(404);
  });

  it("is a 404 on any other address", () => {
    const request = new Request(
      `https://potluck-git-main-potluck.vercel.app${PATH}`
    );
    expect(answerTestError(request, ENV).status).toBe(404);
  });

  it("is a 404 outside Vercel", () => {
    const request = new Request(`http://localhost:3110${PATH}`);
    expect(answerTestError(request, {}).status).toBe(404);
  });

  it("is a 404 if the deploy's own URL were the production address", () => {
    const request = new Request(`https://potluck-zeta.vercel.app${PATH}`);
    expect(
      answerTestError(request, {
        VERCEL_URL: "potluck-zeta.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
      }).status
    ).toBe(404);
  });
});
