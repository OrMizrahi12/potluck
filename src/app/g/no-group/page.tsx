import { notFound } from "next/navigation";

// Where Proxy sends an unknown group link (see group-link-proxy.ts). The page
// is prerendered, and `notFound()` runs during the prerender, so the response
// is a real 404 showing g/not-found.tsx.
export default function NoGroupPage() {
  notFound();
}
