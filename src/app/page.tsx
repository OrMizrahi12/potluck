import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { readGreeting } from "@/db/greeting";

async function Greeting() {
  await connection(); // read the database per request, never at build time
  const greeting = await readGreeting(getDb());
  return <p>{greeting ?? "Potluck reached its database, which has no seed data."}</p>;
}

export default function Home() {
  return (
    <main>
      <h1>Potluck</h1>
      <Suspense fallback={<p>Connecting…</p>}>
        <Greeting />
      </Suspense>
    </main>
  );
}
