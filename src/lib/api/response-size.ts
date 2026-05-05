import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const KB = 1024;
export const RESPONSE_WARN_BYTES = 500 * KB;
export const RESPONSE_HARD_BYTES = 2 * 1024 * KB;

type GuardOptions = {
  status?: number;
  headers?: HeadersInit;
  route: string;
  arrayKeys?: string[];
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function truncateArrayBody(
  input: Record<string, unknown>,
  key: string,
  maxBytes: number,
): Record<string, unknown> {
  const value = input[key];
  if (!Array.isArray(value)) return input;
  let low = 0;
  let high = value.length;
  let best = input;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = { ...input, [key]: value.slice(0, mid) };
    const size = byteLength(candidate);
    if (size <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function addTruncationMeta(
  input: Record<string, unknown>,
  route: string,
  originalBytes: number,
): Record<string, unknown> {
  const meta =
    typeof input.meta === "object" && input.meta !== null
      ? (input.meta as Record<string, unknown>)
      : {};
  return {
    ...input,
    meta: {
      ...meta,
      responseTruncated: true,
      responseTruncatedRoute: route,
      responseOriginalBytes: originalBytes,
      responseWarnBytes: RESPONSE_WARN_BYTES,
    },
  };
}

export function respondWithSizeGuard(
  body: unknown,
  options: GuardOptions,
): NextResponse {
  const baseHeaders = new Headers(options.headers);
  const status = options.status ?? 200;
  const originalBytes = byteLength(body);

  if (originalBytes > RESPONSE_HARD_BYTES) {
    Sentry.addBreadcrumb({
      category: "api.response.size",
      level: "warning",
      message: "response hard cap exceeded",
      data: {
        route: options.route,
        bytes: originalBytes,
        hardBytes: RESPONSE_HARD_BYTES,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        error: "response_too_large",
        code: "response_too_large",
        maxBytes: RESPONSE_HARD_BYTES,
      },
      { status: 413, headers: baseHeaders },
    );
  }

  if (originalBytes <= RESPONSE_WARN_BYTES) {
    return NextResponse.json(body, { status, headers: baseHeaders });
  }

  Sentry.addBreadcrumb({
    category: "api.response.size",
    level: "warning",
    message: "response warn cap exceeded; truncating",
    data: {
      route: options.route,
      bytes: originalBytes,
      warnBytes: RESPONSE_WARN_BYTES,
    },
  });

  let candidate = body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const keys = options.arrayKeys ?? ["items", "repos", "bundles"];
    for (const key of keys) {
      candidate = truncateArrayBody(
        candidate as Record<string, unknown>,
        key,
        RESPONSE_WARN_BYTES,
      );
    }
    candidate = addTruncationMeta(
      candidate as Record<string, unknown>,
      options.route,
      originalBytes,
    );
  }

  return NextResponse.json(candidate, { status, headers: baseHeaders });
}
