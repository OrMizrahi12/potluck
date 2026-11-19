import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { runSmoke } from "./smoke.mjs";

const COMMIT = "fa1eade47b73733d6312d5abfad33ce9e4068081";
const OLDER_COMMIT = "0b9e2c47d1a6f3e8b5c7a9d2e4f6081a3c5e7b9d";
const NEWER_COMMIT = "7c1d3e5a9b2f4c6d8e0a1b3c5d7e9f0a2b4c6d8e";

type Answer = { status: number; body: string };
type Answers = (path: string) => Answer;

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

/** A stand-in production address answering each path as `answers` says. */
async function serve(answers: Answers): Promise<string> {
  server = createServer((request, response) => {
    const answer = answers(request.url ?? "/");
    response.writeHead(answer.status, { "content-type": "text/html" });
    response.end(answer.body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("smoke test", () => {
  it("passes when the address reports the commit and every page answers", async () => {
    const baseUrl = await serve((path) => {
      if (path === "/api/health")
        return {
          status: 200,
          body: JSON.stringify({ status: "ok", commit: COMMIT }),
        };
      if (path === "/")
        return { status: 200, body: "<main><h1>Potluck</h1></main>" };
      if (path.startsWith("/g/"))
        return {
          status: 404,
          body: "<main><h1>No group at this link</h1></main>",
        };
      return { status: 404, body: "" };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 1000,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result.passed).toBe(true);
  });

  it("waits while the address still reports the previous release", async () => {
    let asks = 0;
    const baseUrl = await serve((path) => {
      if (path === "/api/health") {
        asks += 1;
        return {
          status: 200,
          body: JSON.stringify({
            status: "ok",
            commit: asks < 3 ? OLDER_COMMIT : COMMIT,
          }),
        };
      }
      if (path === "/")
        return { status: 200, body: "<main><h1>Potluck</h1></main>" };
      return {
        status: 404,
        body: "<main><h1>No group at this link</h1></main>",
      };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 1000,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: true,
      summary: "Smoke test passed",
    });
  });

  it("fails, saying so, when the address never reports the commit", async () => {
    const baseUrl = await serve((path) => {
      if (path === "/api/health")
        return {
          status: 200,
          body: JSON.stringify({ status: "ok", commit: OLDER_COMMIT }),
        };
      if (path === "/")
        return { status: 200, body: "<main><h1>Potluck</h1></main>" };
      return {
        status: 404,
        body: "<main><h1>No group at this link</h1></main>",
      };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 100,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: false,
      summary:
        "Production never reported fa1eade within 0.1s: it still reports 0b9e2c4",
    });
  });

  it("passes untested, at once, when production has moved on to a later commit", async () => {
    const pagesAsked: string[] = [];
    const baseUrl = await serve((path) => {
      pagesAsked.push(path);
      if (path === "/api/health")
        return {
          status: 200,
          body: JSON.stringify({ status: "ok", commit: NEWER_COMMIT }),
        };
      return { status: 500, body: "" };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      // Far longer than the test may run: it must not wait.
      timeoutMs: 60_000,
      intervalMs: 10,
      isNewer: async (seen) => seen === NEWER_COMMIT,
    });

    expect(result).toMatchObject({
      passed: true,
      summary: "Not smoke-tested: production moved on to 7c1d3e5",
    });
    expect(pagesAsked).toEqual(["/api/health"]);
  });

  it("fails when /api/health never reports the commit within the wait", async () => {
    const baseUrl = await serve(() => ({ status: 500, body: "" }));

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 100,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: false,
      summary:
        "Production never reported fa1eade within 0.1s: /api/health answered HTTP 500",
    });
  });

  it("fails when the home page doesn't render", async () => {
    const baseUrl = await serve((path) => {
      if (path === "/api/health")
        return {
          status: 200,
          body: JSON.stringify({ status: "ok", commit: COMMIT }),
        };
      if (path === "/") return { status: 500, body: "Internal Server Error" };
      return {
        status: 404,
        body: "<main><h1>No group at this link</h1></main>",
      };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 1000,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: false,
      summary: "The home page answered HTTP 500, not the Potluck page",
    });
  });

  it("fails when a made-up group link doesn't show that there's no group", async () => {
    const baseUrl = await serve((path) => {
      if (path === "/api/health")
        return {
          status: 200,
          body: JSON.stringify({ status: "ok", commit: COMMIT }),
        };
      if (path === "/")
        return { status: 200, body: "<main><h1>Potluck</h1></main>" };
      return { status: 200, body: "<main><h1>Trip to Lisbon</h1></main>" };
    });

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 1000,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: false,
      summary:
        'A made-up group link answered HTTP 200, not "No group at this link"',
    });
  });

  it("fails, saying so, when nothing answers at the address", async () => {
    // Bind a port, then close it: nothing answers there.
    const baseUrl = await serve(() => ({ status: 200, body: "" }));
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;

    const result = await runSmoke({
      baseUrl,
      commit: COMMIT,
      timeoutMs: 50,
      intervalMs: 10,
      isNewer: async () => false,
    });

    expect(result).toMatchObject({
      passed: false,
      summary:
        "Production never reported fa1eade within 0.05s: /api/health didn't answer (ECONNREFUSED)",
    });
  });
});
