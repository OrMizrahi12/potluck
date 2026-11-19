import { describe, expect, it } from "vitest";
import { guardProductionBuild } from "./build-source";

describe("the production build's source check", () => {
  it("refuses a production build with no Git variables, as a CLI upload has", () => {
    expect(() =>
      guardProductionBuild({ VERCEL_ENV: "production" }, () => undefined)
    ).toThrow(/provider: \(unset\)/);
  });

  it("refuses a Vercel build whose system variables are switched off", () => {
    expect(() =>
      guardProductionBuild({ VERCEL: "1" }, () => undefined)
    ).toThrow(/environment: \(unset\)/);
  });

  it("refuses a Vercel build with no environment though its Git variables match main", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL: "1",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toThrow(/environment: \(unset\)/);
  });

  it("passes a GitHub build of main whose checkout HEAD is the reported commit, with a line for the build log", () => {
    expect(
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toBe(
      "Production build source check passed: GitHub built OrMizrahi12/potluck's main at 3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39, and the checkout's HEAD matches."
    );
  });

  it("refuses a production build of another branch, as a preview released to production is", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "feature/x",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toThrow(/branch: feature\/x/);
  });

  it("refuses a production build of another repo", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "someone-else",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toThrow(/repo: someone-else\/potluck/);
  });

  it("refuses a production build from a provider other than GitHub", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "gitlab",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toThrow(/provider: gitlab/);
  });

  it("refuses a production build that reports an empty commit", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      )
    ).toThrow(/commit: \(unset\)/);
  });

  it("refuses a production build whose checkout has no .git, so CLI metadata can't pass it", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => undefined
      )
    ).toThrow(/checkout HEAD: \(no \.git\)/);
  });

  it("refuses a production build with neither a reported commit nor a .git", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
        },
        () => undefined
      )
    ).toThrow(/commit: \(unset\)/);
  });

  it("refuses a production build whose checkout HEAD isn't the reported commit", () => {
    expect(() =>
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "main",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
        },
        () => "0000000000000000000000000000000000000001"
      )
    ).toThrow("checkout HEAD: 0000000000000000000000000000000000000001");
  });

  it("names no connection string in its refusal", () => {
    let message = "";
    try {
      guardProductionBuild(
        {
          VERCEL_ENV: "production",
          VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: "OrMizrahi12",
          VERCEL_GIT_REPO_SLUG: "potluck",
          VERCEL_GIT_COMMIT_REF: "feature/x",
          VERCEL_GIT_COMMIT_SHA: "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
          DATABASE_URL: "postgres://owner:hunter2@ep-example.neon.tech/potluck",
          DATABASE_URL_UNPOOLED:
            "postgres://owner:hunter2@ep-example.neon.tech/potluck",
        },
        () => "3f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("branch: feature/x");
    expect(message).not.toContain("hunter2");
  });

  it("leaves preview builds and local runs alone, with nothing for the log", () => {
    expect(
      guardProductionBuild(
        { VERCEL: "1", VERCEL_ENV: "preview" },
        () => undefined
      )
    ).toBeUndefined();
    expect(guardProductionBuild({}, () => undefined)).toBeUndefined();
  });
});
