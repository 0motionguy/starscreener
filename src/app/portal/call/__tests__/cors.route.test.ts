import assert from "node:assert/strict";
import test from "node:test";

import { OPTIONS } from "../route";

function withPortalEnv(fn: () => Promise<void> | void): Promise<void> | void {
  // Cast through Record to bypass TS readonly NODE_ENV (mirrors wave2 pattern)
  const env = process.env as Record<string, string | undefined>;
  const prevNodeEnv = env.NODE_ENV;
  const prevPublic = env.NEXT_PUBLIC_SITE_URL;
  const prevPortalAllow = env.PORTAL_CORS_ALLOWED_ORIGINS;
  env.NODE_ENV = "production";
  env.NEXT_PUBLIC_SITE_URL = "https://trendingrepo.com";
  env.PORTAL_CORS_ALLOWED_ORIGINS = "https://trendingrepo.com";
  try {
    return fn();
  } finally {
    if (prevNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prevNodeEnv;
    if (prevPublic === undefined) delete env.NEXT_PUBLIC_SITE_URL;
    else env.NEXT_PUBLIC_SITE_URL = prevPublic;
    if (prevPortalAllow === undefined) delete env.PORTAL_CORS_ALLOWED_ORIGINS;
    else env.PORTAL_CORS_ALLOWED_ORIGINS = prevPortalAllow;
  }
}

test("OPTIONS /portal/call denies disallowed origin without ACAO reflection", () =>
  withPortalEnv(() => {
    const req = new Request("http://localhost:3023/portal/call", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });
    const res = OPTIONS(req as never);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  }));

test("OPTIONS /portal/call allows configured origin", () =>
  withPortalEnv(() => {
    const req = new Request("http://localhost:3023/portal/call", {
      method: "OPTIONS",
      headers: {
        origin: "https://trendingrepo.com",
        "access-control-request-method": "POST",
      },
    });
    const res = OPTIONS(req as never);
    assert.equal(res.status, 204);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "https://trendingrepo.com",
    );
  }));
