import { connection } from "next/server";

// Liveness only: answers without touching the database, so it stays up even
// when Neon is cold or unreachable.
export async function GET() {
  await connection(); // run per request, never prerendered
  return Response.json({ status: "ok" });
}
