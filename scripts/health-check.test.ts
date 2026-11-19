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

function report({
  reachable = true,
  schemaCurrent = true,
  bytes = 50_000_000,
}: { reachable?: boolean; schemaCurrent?: boolean; bytes?: number } = {}) {
  return JSON.stringify({
    status: reachable && schemaCurrent ? "ok" : "failing",
    commit: "fa1eade47b73733d6312d5abfad33ce9e4068081",
    database: {
      reachable,
      schemaCurrent,
      storage: reachable ? { bytes, limitBytes: 1_000_000_000 } : null,
    },
  });
}

const healthy = { status: 200, body: report() };

describe("hourly health check", () => {
  it("passes when production answers healthy, and says how much storage it uses", async () => {
    const baseUrl = await serve(healthy);

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(true);
    expect(result.summary).toContain("5%");
  });

  it("fails once storage reaches 80% of the plan's limit", async () => {
    const baseUrl = await serve({
      status: 200,
      body: report({ bytes: 800_000_000 }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("80%");
  });

  it("fails, saying so, when the schema isn't current", async () => {
    const baseUrl = await serve({
      status: 503,
      body: report({ schemaCurrent: false }),
    });

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/schema/i);
  });

  it("fails, saying so, when production can't reach its database", async () => {
    const baseUrl = await serve({
      status: 503,
      body: report({ reachable: false }),
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

  it("fails, saying so, when nothing answers at the address", async () => {
    const baseUrl = await serve(healthy);
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("didn't answer");
  });

  it("passes when a failure clears on the second ask", async () => {
    const baseUrl = await serve(
      { status: 503, body: report({ reachable: false }) },
      healthy
    );

    const result = await checkHealth({ baseUrl, retryAfterMs: 10 });

    expect(result.passed).toBe(true);
  });
});
