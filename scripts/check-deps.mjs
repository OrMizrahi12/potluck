// Fails if Neon's HTTP-only driver is anywhere in the dependency tree. The app
// uses a standard Postgres driver over TCP so local Postgres and production
// behave the same.
import { readFileSync } from "node:fs";

const FORBIDDEN = ["@neondatabase/serverless"];

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const found = Object.keys(lock.packages ?? {}).filter((path) =>
  FORBIDDEN.some((name) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)),
);

if (found.length > 0) {
  console.error(`Forbidden dependency found: ${found.join(", ")}`);
  process.exit(1);
}
console.log("No forbidden dependencies.");
