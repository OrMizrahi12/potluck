type Env = Record<string, string | undefined>;

/**
 * The test error #67 throws in production to see an error reach Sentry. Its
 * route's path carries a made-up group link, so the report shows the link
 * token scrubbed from the URL, the transaction name and the message.
 *
 * It throws only on the deploy's own URL (`VERCEL_URL`), which deployment
 * protection keeps to the operator. Anywhere else, the public production
 * address included, it answers an empty 404, as if it didn't exist.
 */
export function answerTestError(request: Request, env: Env): Response {
  const { host, pathname } = new URL(request.url);
  const onOwnUrl =
    !!env.VERCEL_URL &&
    host === env.VERCEL_URL &&
    host !== env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!onOwnUrl) return new Response(null, { status: 404 });
  throw new Error(`Test error, thrown on purpose at ${pathname}`);
}
