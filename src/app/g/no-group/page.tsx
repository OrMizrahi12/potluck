import { notFound } from "next/navigation";

// Nothing here to navigate into instantly: the page only ever answers 404.
// Left on, dev's instant-navigation validation can't render the segment past
// `notFound()` and logs an error for every unknown link (#23).
export const instant = false;

// Where Proxy sends an unknown group link (see group-link-proxy.ts). The page
// is prerendered, and `notFound()` runs during the prerender, so the response
// is a real 404 showing g/not-found.tsx.
export default function NoGroupPage() {
  notFound();
}
