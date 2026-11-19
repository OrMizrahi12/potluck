import { describe, expect, it } from "vitest";
import { answerTestError } from "./test-error";

// What Vercel sets on a deploy: VERCEL_URL, its own URL behind deployment
// protection, and VERCEL_PROJECT_PRODUCTION_URL, the public production address.

describe("the test error", () => {
  it("is thrown on the deploy's own URL", () => {
    const request = new Request(
      "https://potluck-abc123def-potluck.vercel.app/api/test-error/g/SentryTestNotARealLink"
    );
    expect(() =>
      answerTestError(request, {
        VERCEL_URL: "potluck-abc123def-potluck.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
      })
    ).toThrow(
      "Test error, thrown on purpose at /api/test-error/g/SentryTestNotARealLink"
    );
  });

  it("is a 404 on the public production address", () => {
    const request = new Request(
      "https://potluck-zeta.vercel.app/api/test-error/g/SentryTestNotARealLink"
    );
    const answer = answerTestError(request, {
      VERCEL_URL: "potluck-abc123def-potluck.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
    });
    expect(answer.status).toBe(404);
  });

  it("is a 404 on any other address", () => {
    const request = new Request(
      "https://potluck-git-main-potluck.vercel.app/api/test-error/g/SentryTestNotARealLink"
    );
    const answer = answerTestError(request, {
      VERCEL_URL: "potluck-abc123def-potluck.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
    });
    expect(answer.status).toBe(404);
  });

  it("is a 404 outside Vercel", () => {
    const request = new Request(
      "http://localhost:3110/api/test-error/g/SentryTestNotARealLink"
    );
    expect(answerTestError(request, {}).status).toBe(404);
  });

  it("is a 404 if the deploy's own URL were the production address", () => {
    const request = new Request(
      "https://potluck-zeta.vercel.app/api/test-error/g/SentryTestNotARealLink"
    );
    const answer = answerTestError(request, {
      VERCEL_URL: "potluck-zeta.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "potluck-zeta.vercel.app",
    });
    expect(answer.status).toBe(404);
  });
});
