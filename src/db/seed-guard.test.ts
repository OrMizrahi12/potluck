import { describe, expect, it } from "vitest";
import { guardSeed } from "./seed-guard";

describe("the seed's production guard", () => {
  it("refuses a production environment, local database or not", () => {
    expect(() =>
      guardSeed(
        { VERCEL_ENV: "production" },
        "postgresql:///potluck?host=/var/run/postgresql"
      )
    ).toThrow(/production/);
  });

  it.each([
    "postgresql:///potluck?host=/var/run/postgresql",
    "postgresql:///potluck",
    "postgresql://localhost:5432/potluck",
    "postgres://me:pw@127.0.0.1/potluck",
    "postgresql://[::1]:5432/potluck",
  ])("lets a local database through: %s", (url) => {
    expect(() => guardSeed({}, url)).not.toThrow();
  });

  it("refuses a remote database without POTLUCK_ALLOW_REMOTE_SEED=1", () => {
    expect(() =>
      guardSeed(
        {},
        "postgresql://neondb_owner:secret@ep-quiet-sky-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require"
      )
    ).toThrow(
      /ep-quiet-sky-123456\.eu-central-1\.aws\.neon\.tech.*POTLUCK_ALLOW_REMOTE_SEED=1/
    );
  });

  it("refuses a remote host named in the last of several host parameters, as pg connects to the last", () => {
    expect(() =>
      guardSeed(
        {},
        "postgresql://localhost/neondb?host=localhost&host=ep-quiet-sky-123456.eu-central-1.aws.neon.tech"
      )
    ).toThrow(/ep-quiet-sky-123456/);
  });

  it("refuses a URL with no host when PGHOST points at a remote database", () => {
    expect(() =>
      guardSeed(
        { PGHOST: "ep-quiet-sky-123456.eu-central-1.aws.neon.tech" },
        "postgresql:///neondb"
      )
    ).toThrow(/ep-quiet-sky-123456/);
  });

  it("refuses a connection string it can't read", () => {
    expect(() => guardSeed({}, "host=db.example.com dbname=potluck")).toThrow(
      /POTLUCK_ALLOW_REMOTE_SEED=1/
    );
  });

  it("lets a remote database through when POTLUCK_ALLOW_REMOTE_SEED=1", () => {
    expect(() =>
      guardSeed(
        { POTLUCK_ALLOW_REMOTE_SEED: "1" },
        "postgresql://neondb_owner:secret@ep-quiet-sky-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require"
      )
    ).not.toThrow();
  });

  it("refuses production whatever POTLUCK_ALLOW_REMOTE_SEED says", () => {
    expect(() =>
      guardSeed(
        { VERCEL_ENV: "production", POTLUCK_ALLOW_REMOTE_SEED: "1" },
        "postgresql://neondb_owner:secret@ep-quiet-sky-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require"
      )
    ).toThrow(/production/);
  });
});
