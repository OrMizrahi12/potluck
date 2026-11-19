import { describe, expect, it } from "vitest";
import { sentryBuildOptions, sentryDsn } from "./production";

describe("the DSN a build reports errors to", () => {
  it("is the integration's DSN in a production build", () => {
    expect(
      sentryDsn({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN:
          "https://0123456789abcdef@o123.ingest.de.sentry.io/456",
      })
    ).toBe("https://0123456789abcdef@o123.ingest.de.sentry.io/456");
  });

  it("is none in a preview build, whatever DSN it has set", () => {
    expect(
      sentryDsn({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SENTRY_DSN:
          "https://0123456789abcdef@o123.ingest.de.sentry.io/456",
      })
    ).toBeUndefined();
  });

  it("is none outside Vercel, whatever DSN it has set", () => {
    expect(
      sentryDsn({
        NEXT_PUBLIC_SENTRY_DSN:
          "https://0123456789abcdef@o123.ingest.de.sentry.io/456",
      })
    ).toBeUndefined();
  });

  it("is none in a production build with no DSN set", () => {
    expect(
      sentryDsn({ VERCEL_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: "" })
    ).toBeUndefined();
  });
});

describe("source map uploads", () => {
  it("happen from a production build, with the integration's credentials", () => {
    expect(
      sentryBuildOptions({
        VERCEL_ENV: "production",
        SENTRY_AUTH_TOKEN: "sntrys_made_up",
        SENTRY_ORG: "potluck-org",
        SENTRY_PROJECT: "potluck",
      })
    ).toMatchObject({
      authToken: "sntrys_made_up",
      org: "potluck-org",
      project: "potluck",
      sourcemaps: { disable: false },
      release: { create: true },
      telemetry: false,
    });
  });

  it("are switched off in a preview build, whatever credentials it has set", () => {
    const options = sentryBuildOptions({
      VERCEL_ENV: "preview",
      SENTRY_AUTH_TOKEN: "sntrys_made_up",
      SENTRY_ORG: "potluck-org",
      SENTRY_PROJECT: "potluck",
    });
    expect(options).toMatchObject({
      sourcemaps: { disable: true },
      release: { create: false },
      telemetry: false,
    });
    expect(JSON.stringify(options)).not.toContain("sntrys_made_up");
  });

  it("are switched off outside Vercel", () => {
    expect(
      sentryBuildOptions({
        SENTRY_AUTH_TOKEN: "sntrys_made_up",
        SENTRY_ORG: "potluck-org",
        SENTRY_PROJECT: "potluck",
      })
    ).toMatchObject({
      sourcemaps: { disable: true },
      release: { create: false },
    });
  });
});
