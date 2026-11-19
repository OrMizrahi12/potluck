import { connection } from "next/server";
import journal from "../../../../drizzle/meta/_journal.json";
import { getDb } from "../../../db/client";
import { healthReport } from "./health-report";

// Health: asks the database whether it answers, whether it has every
// migration this deploy was built with, and how big it is. The hourly check
// and the smoke test call it; the uptime monitor calls `/api/live`, which
// never touches the database. The journal is imported, not read from disk, so
// it ships inside the function.
export async function GET() {
  await connection(); // run per request, never prerendered
  const report = await healthReport({
    openDb: getDb,
    env: process.env,
    journal: journal.entries,
  });
  return Response.json(report, { status: report.status === "ok" ? 200 : 503 });
}
