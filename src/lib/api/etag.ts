import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function buildEtag(body: unknown): string {
  const json = JSON.stringify(body);
  const digest = createHash("sha1").update(json).digest("base64url");
  return `W/"${digest}"`;
}

function ifNoneMatchMatches(headerValue: string | null, etag: string): boolean {
  if (!headerValue) return false;
  const trimmed = headerValue.trim();
  if (trimmed === "*") return true;
  return trimmed
    .split(",")
    .map((token) => token.trim())
    .includes(etag);
}

export function jsonWithEtag(
  request: NextRequest,
  body: unknown,
  init?: Omit<ResponseInit, "status"> & { status?: number },
): NextResponse {
  const etag = buildEtag(body);
  const headers = new Headers(init?.headers);
  headers.set("ETag", etag);

  if (ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers,
    });
  }

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}
