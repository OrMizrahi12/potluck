import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkHealth } from "./health-check.mjs";

type Answer = { status: number; body: string };

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

/** A stand-in production address whose /api/health answers each ask in turn. */
async function serve(...answers: Answer[]): Promise<string> {
  let asks = 0;
  server = createServer((request, response) => {
    const answer =
      request.url === "/api/health"
        ? answers[Math.min(asks++, answers.length - 1)]
        : { status: 404, body: "" };
    response.writeHead(answer.status, { "content-type": "application/json" });
    response.end(answer.body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("hourly health check", () => {
  it("passes when production answers healthy, and says how much storage it uses", async () => {
    const baseUrl = await serve({
      status: 200,
      body: JSON.stringify({
        status: "ok",
        commit: null,
        database: {
          reachable: true,
          schemaCurrent: true,
          storage: { bytes: 50_000_000, limitBytes: 1_000_000_000 },
        },
      }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(true);
    expect(result.summary).toContain("5%");
  });

  it("fails once storage reaches 80% of the plan's limit", async () => {
    const baseUrl = await serve({
      status: 200,
      body: JSON.stringify({
        status: "ok",
        commit: null,
        database: {
          reachable: true,
          schemaCurrent: true,
          storage: { bytes: 800_000_000, limitBytes: 1_000_000_000 },
        },
      }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("80%");
  });

  it("fails, saying so, when the schema isn't current", async () => {
    const baseUrl = await serve({
      status: 503,
      body: JSON.stringify({
        status: "failing",
        commit: null,
        database: {
          reachable: true,
          schemaCurrent: false,
          storage: { bytes: 50_000_000, limitBytes: 1_000_000_000 },
        },
      }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/schema/i);
  });

  it("fails, saying so, when production can't reach its database", async () => {
    const baseUrl = await serve({
      status: 503,
      body: JSON.stringify({
        status: "failing",
        commit: null,
        database: { reachable: false, schemaCurrent: false, storage: null },
      }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/database/i);
  });

  it("fails, saying what came back, when the answer isn't a health report", async () => {
    const baseUrl = await serve({
      status: 503,
      body: "<html>DEPLOYMENT_PAUSED</html>",
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("HTTP 503");
  });

  it("fails, saying what came back, when a reachable database reports no storage", async () => {
    const baseUrl = await serve({
      status: 200,
      body: JSON.stringify({
        status: "ok",
        commit: null,
        database: { reachable: true, schemaCurrent: true, storage: null },
      }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("HTTP 200");
  });

  it("fails, saying so, when nothing answers at the address", async () => {
    const baseUrl = await serve({ status: 200, body: "" });
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("didn't answer");
  });

  it("passes when a failure clears on the second ask", async () => {
    const baseUrl = await serve(
      {
        status: 503,
        body: JSON.stringify({
          status: "failing",
          commit: null,
          database: { reachable: false, schemaCurrent: false, storage: null },
        }),
      },
      {
        status: 200,
        body: JSON.stringify({
          status: "ok",
          commit: null,
          database: {
            reachable: true,
            schemaCurrent: true,
            storage: { bytes: 50_000_000, limitBytes: 1_000_000_000 },
          },
        }),
      }
    );

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(true);
  });
});
