import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// A group link's link token is its only access, so it never reaches Sentry.
// Each `/g/<segment>` becomes `/g/[token]`, wherever it appears: URLs, route
// names, messages, breadcrumbs, request data, stack frames. A segment counts
// when it's made of a link token's characters (base64url), so a mistyped or
// cut-short link goes too. Left alone, so stack frames still map to source:
// the app's own segments under app/g (`[token]`, its URL-encoded form,
// `no-group`) and a file name such as `group-link-proxy.ts`.
const GROUP_LINK =
  /\/g\/(?!(?:\[token\]|%5Btoken%5D|no-group)(?![\w-]))[\w-]+(?![\w-]|\.[A-Za-z]{1,4}\b)/g;

function scrubString(text: string): string {
  return text.replace(GROUP_LINK, "/g/[token]");
}

/** Rewrites every string inside `value`, at any depth. */
function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return scrubString(value) as T;
  if (Array.isArray(value)) return value.map(scrubDeep) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        scrubString(key),
        scrubDeep(inner),
      ])
    ) as T;
  }
  return value;
}

/**
 * `beforeSend`, on client and server. Besides the link tokens, it drops what
 * would carry an IP address or a cookie: the user info, and the request's headers,
 * cookies and environment. `dataCollection` already stops the SDK collecting them; this
 * still holds if a default changes.
 */
export function scrubErrorReport(report: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = scrubDeep(report);
  delete scrubbed.user;
  if (scrubbed.request) {
    delete scrubbed.request.headers;
    delete scrubbed.request.cookies;
    delete scrubbed.request.env;
  }
  return scrubbed;
}

/** `beforeBreadcrumb`, on client and server. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return scrubDeep(breadcrumb);
}
