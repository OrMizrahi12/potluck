import { connection } from "next/server";

// Liveness: what Sentry's uptime monitor calls every 5 minutes. It must never
// touch the database, so a cold or unreachable Neon doesn't page anyone and
// the checks don't spend Neon's compute. Import nothing from `src/db` here.
export async function GET() {
  await connection(); // run per request, never prerendered
  return Response.json({ status: "ok" });
}
