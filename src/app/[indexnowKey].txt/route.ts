// IndexNow key file — protocol requires this at /<key>.txt at site root.
// We use a dynamic-style folder name to avoid hardcoding the key in a static
// path. Important: Next.js treats `[indexnowKey].txt` as a LITERAL folder
// name (the bracket-with-suffix pattern is NOT parsed as a dynamic segment),
// so we don't get a `params.indexnowKey` value. Instead we extract the
// requested key from the URL's first path segment and validate it against
// INDEXNOW_KEY env var.
//
// Static-named routes (app/llms.txt/, app/llms-full.txt/, app/feed.xml/,
// app/.well-known/*) take precedence over this catch-all in Next.js.

import { NextResponse } from "next/server";
import { getIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = getIndexNowKey();
  if (!expected) {
    return new NextResponse("Not Found", { status: 404 });
  }
  // Path looks like "/<something>.txt"; strip the leading slash and the
  // trailing ".txt" to recover the requested key.
  const pathname = new URL(req.url).pathname;
  const match = pathname.match(/^\/([^/]+)\.txt$/);
  const requestedKey = match?.[1];
  if (!requestedKey || requestedKey !== expected) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(expected, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
