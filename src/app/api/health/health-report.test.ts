import { describe, expect, it } from "vitest";
import { healthReport } from "./health-report";

describe("health report", () => {
  it("names the commit the deploy was built from", () => {
    expect(
      healthReport({
        VERCEL_GIT_COMMIT_SHA: "fa1eade47b73733d6312d5abfad33ce9e4068081",
      })
    ).toEqual({
      status: "ok",
      commit: "fa1eade47b73733d6312d5abfad33ce9e4068081",
    });
  });

  it("names no commit outside a Vercel build", () => {
    expect(healthReport({})).toEqual({ status: "ok", commit: null });
  });

  it("names no commit when the variable is empty", () => {
    expect(healthReport({ VERCEL_GIT_COMMIT_SHA: "" })).toEqual({
      status: "ok",
      commit: null,
    });
  });
});
