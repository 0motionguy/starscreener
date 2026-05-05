import { describe, expect, it } from "vitest";
import {
  RESPONSE_HARD_BYTES,
  RESPONSE_WARN_BYTES,
  respondWithSizeGuard,
} from "@/lib/api/response-size";

describe("respondWithSizeGuard", () => {
  it("passes through small payloads", async () => {
    const res = respondWithSizeGuard(
      { ok: true, repos: [{ id: "a" }] },
      { route: "/api/repos", arrayKeys: ["repos"] },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 413 when payload exceeds hard cap", async () => {
    const huge = { items: ["x".repeat(RESPONSE_HARD_BYTES)] };
    const res = respondWithSizeGuard(huge, { route: "/api/feed/reddit" });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("response_too_large");
  });

  it("truncates arrays when payload exceeds warn cap", async () => {
    const items = Array.from({ length: 2000 }, (_, i) => ({
      id: i,
      text: "x".repeat(600),
    }));
    const res = respondWithSizeGuard(
      { ok: true, items },
      { route: "/api/feed/reddit", arrayKeys: ["items"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: number; text: string }>;
      meta: { responseTruncated?: boolean };
    };
    expect(body.meta?.responseTruncated).toBe(true);
    const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    expect(bytes).toBeLessThanOrEqual(RESPONSE_WARN_BYTES);
  });
});
