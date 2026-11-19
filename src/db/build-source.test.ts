import { describe, expect, it } from "vitest";
import { guardProductionBuild } from "./build-source";

const SHA = "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39";

/** What Vercel sets for a production build GitHub triggered from `main`. */
const githubMainBuild = {
  VERCEL_ENV: "production",
  VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
  VERCEL_GIT_REPO_SLUG: "potluck",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: SHA,
};

describe("the production build's source check", () => {
  it("refuses a production build with no Git variables, as a CLI upload has", () => {
    expect(() =>
      guardProductionBuild({ VERCEL_ENV: "production" }, () => undefined)
    ).toThrow(/provider: \(unset\)/);
  });

  it("passes a GitHub build of main whose checkout HEAD is the reported commit", () => {
    expect(() =>
      guardProductionBuild(githubMainBuild, () => SHA)
    ).not.toThrow();
  });

  it.each([
    [
      "another branch, as a promoted preview is",
      { ...githubMainBuild, VERCEL_GIT_COMMIT_REF: "feature/x" },
      /branch: feature\/x/,
    ],
    [
      "another repo",
      { ...githubMainBuild, VERCEL_GIT_REPO_OWNER: "someone-else" },
      /repo: someone-else\/potluck/,
    ],
    [
      "a provider other than GitHub",
      { ...githubMainBuild, VERCEL_GIT_PROVIDER: "gitlab" },
      /provider: gitlab/,
    ],
    [
      "no reported commit",
      { ...githubMainBuild, VERCEL_GIT_COMMIT_SHA: "" },
      /commit: \(unset\)/,
    ],
  ])("refuses a production build from %s", (_, env, seen) => {
    expect(() => guardProductionBuild(env, () => SHA)).toThrow(seen);
  });

  it("refuses a production build whose checkout has no .git, so CLI metadata can't pass it", () => {
    expect(() =>
      guardProductionBuild(githubMainBuild, () => undefined)
    ).toThrow(/checkout HEAD: \(no \.git\)/);
  });

  it("refuses a production build with neither a reported commit nor a .git", () => {
    expect(() =>
      guardProductionBuild(
        { ...githubMainBuild, VERCEL_GIT_COMMIT_SHA: undefined },
        () => undefined
      )
    ).toThrow(/commit: \(unset\)/);
  });

  it("refuses a production build whose checkout HEAD isn't the reported commit", () => {
    const otherHead = "0000000000000000000000000000000000000001";
    expect(() =>
      guardProductionBuild(githubMainBuild, () => otherHead)
    ).toThrow(`checkout HEAD: ${otherHead}`);
  });

  it("names no connection string in its refusal", () => {
    const secret = "postgres://owner:hunter2@ep-example.neon.tech/potluck";
    let message = "";
    try {
      guardProductionBuild(
        {
          ...githubMainBuild,
          VERCEL_GIT_COMMIT_REF: "feature/x",
          DATABASE_URL: secret,
          DATABASE_URL_UNPOOLED: secret,
        },
        () => SHA
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("branch: feature/x");
    expect(message).not.toContain("hunter2");
  });

  it("leaves preview builds and local runs alone", () => {
    expect(() =>
      guardProductionBuild({ VERCEL_ENV: "preview" }, () => undefined)
    ).not.toThrow();
    expect(() => guardProductionBuild({}, () => undefined)).not.toThrow();
  });
});
