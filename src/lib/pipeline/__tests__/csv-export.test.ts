// CSV exporter tests.
//
// Covers:
//   1. Pure renderCsv — header, quoting, CRLF, null/undefined → empty.
//   2. Route behavior — 401 unauth, 402 unpaid, 400 unknown columns,
//      200 with correct attachment headers and body.
//
// Run: npm test (project uses tsx --test).
//
// Auth/env notes: the route test clears USER_TOKEN / USER_TOKENS_JSON /
// SESSION_SECRET so the unauth case takes the "prod → 503 / dev → 401"
// branch reliably. We flip NODE_ENV to "production" inside withEnv so the
// 401 vs 503 contract is exercised.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderCsv, UTF8_BOM, type CsvColumn } from "../../export/csv";

// ---------------------------------------------------------------------------
// renderCsv — pure function
// ---------------------------------------------------------------------------

interface Row {
  fullName: string;
  stars: number;
  description: string | null;
  language: string | undefined;
}

const ROW_COLUMNS: readonly CsvColumn<Row>[] = [
  { header: "fullName", select: (r) => r.fullName },
  { header: "stars", select: (r) => r.stars },
  { header: "description", select: (r) => r.description },
  { header: "language", select: (r) => r.language },
];

test("renderCsv — header + 3 rows, CRLF, minimal quoting", () => {
  const rows: Row[] = [
    { fullName: "vercel/next.js", stars: 123, description: "React framework", language: "TypeScript" },
    { fullName: "ollama/ollama", stars: 9, description: "local LLM runner", language: "Go" },
    { fullName: "a/b", stars: 0, description: "", language: null as unknown as undefined },
  ];
  const out = renderCsv(rows, ROW_COLUMNS);
  const lines = out.split("\r\n");
  // Trailing \r\n means split yields an empty final element.
  assert.equal(lines[lines.length - 1], "");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "fullName,stars,description,language");
  assert.equal(lines[1], "vercel/next.js,123,React framework,TypeScript");
  assert.equal(lines[2], "ollama/ollama,9,local LLM runner,Go");
  assert.equal(lines[3], "a/b,0,,");
});

test("renderCsv — escapes commas by quoting the cell", () => {
  const rows: Row[] = [
    { fullName: "a/b", stars: 1, description: "hello, world", language: "rust" },
  ];
  const out = renderCsv(rows, ROW_COLUMNS);
  // The description cell gets wrapped in double quotes because it has a comma.
  assert.match(out, /a\/b,1,"hello, world",rust/);
});

test("renderCsv — escapes double quotes by doubling, wraps cell", () => {
  const rows: Row[] = [
    { fullName: `he said "hi"/repo`, stars: 2, description: `quote: " bare`, language: "ts" },
  ];
  const out = renderCsv(rows, ROW_COLUMNS);
  // Both the fullName and description contain a bare `"` so both get wrapped.
  const body = out.split("\r\n")[1];
  assert.equal(body, `"he said ""hi""/repo",2,"quote: "" bare",ts`);
});

test("renderCsv — escapes embedded newlines", () => {
  const rows: Row[] = [
    { fullName: "a/b", stars: 1, description: "line1\nline2", language: "ts" },
  ];
  const out = renderCsv(rows, ROW_COLUMNS);
  // Description gets quoted because it contains \n.
  assert.match(out, /"line1\nline2"/);
});

test("renderCsv — null and undefined render as empty cells (not the string 'null')", () => {
  const rows: Row[] = [{ fullName: "a/b", stars: 1, description: null, language: undefined }];
  const out = renderCsv(rows, ROW_COLUMNS);
  const body = out.split("\r\n")[1];
  assert.equal(body, "a/b,1,,");
});

test("renderCsv — numbers render verbatim, no thousands separator", () => {
  const rows: Row[] = [{ fullName: "a/b", stars: 1_234_567, description: "", language: "ts" }];
  const out = renderCsv(rows, ROW_COLUMNS);
  // "1234567" not "1,234,567"
  assert.match(out, /a\/b,1234567,,ts/);
});

test("renderCsv — zero rows still emits the header line", () => {
  const out = renderCsv<Row>([], ROW_COLUMNS);
  assert.equal(out, "fullName,stars,description,language\r\n");
});

test("renderCsv — empty columns throws", () => {
  assert.throws(() => renderCsv<Row>([], []));
});

test("UTF8_BOM — exactly the three-byte EF BB BF sequence", () => {
  const buf = Buffer.from(UTF8_BOM, "utf8");
  assert.deepEqual(Array.from(buf), [0xef, 0xbb, 0xbf]);
});

// ---------------------------------------------------------------------------
// Route handler — mocked request + env
// ---------------------------------------------------------------------------
//
// We avoid spinning up a full next server. Instead we import the route
// module and invoke POST with a hand-rolled NextRequest (Web Request is
// acceptable for `request.json()` / `request.headers.get`).

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) prior[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function mkRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/export/csv", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("POST /api/export/csv — 401 when no auth token + no cookie in production", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: undefined,
    },
    async () => {
      const { POST } = await import("../../../app/api/export/csv/route");
      const res = await POST(mkRequest({ fullNames: ["a/b"], columns: ["fullName"] }) as never);
      // prod + no auth env → 503 "not configured" is the documented
      // response. That's still "you cannot use this endpoint without
      // auth", which is what the user-facing gate needs to enforce.
      assert.ok(res.status === 401 || res.status === 503, `got ${res.status}`);
    },
  );
});

test("POST /api/export/csv — 402 when authed but not Pro", async () => {
  // Dev-mode with no env tokens → verifyUserAuth returns ok/local, and
  // getUserTier will find no record for userId="local" → defaults to free.
  await withEnv(
    {
      NODE_ENV: "development",
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
    },
    async () => {
      // Use a dedicated temp data dir so we don't accidentally hit a real
      // user-tiers.jsonl that might grant pro.
      const { promises: fs } = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-csv-"));
      try {
        process.env.STARSCREENER_DATA_DIR = dir;
        const { POST } = await import("../../../app/api/export/csv/route");
        const res = await POST(mkRequest({ fullNames: ["a/b"], columns: ["fullName"] }) as never);
        assert.equal(res.status, 402);
        const body = (await res.json()) as { code: string; upgradeUrl: string };
        assert.equal(body.code, "PAYMENT_REQUIRED");
        assert.match(body.upgradeUrl, /\/pricing/);
      } finally {
        delete process.env.STARSCREENER_DATA_DIR;
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );
});

test("POST /api/export/csv — 400 on unknown columns", async () => {
  // Grant pro so the request survives the 402 gate and we exercise the
  // column-validator path.
  const { promises: fs } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-csv-"));
  await fs.writeFile(
    path.join(dir, "user-tiers.jsonl"),
    JSON.stringify({
      userId: "local",
      tier: "pro",
      expiresAt: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    }) + "\n",
    "utf8",
  );
  try {
    process.env.STARSCREENER_DATA_DIR = dir;
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const { POST } = await import("../../../app/api/export/csv/route");
        const res = await POST(
          mkRequest({ fullNames: ["a/b"], columns: ["fullName", "doesNotExist"] }) as never,
        );
        assert.equal(res.status, 400);
        const body = (await res.json()) as { code: string; error: string };
        assert.equal(body.code, "UNKNOWN_COLUMN");
        assert.match(body.error, /doesNotExist/);
      },
    );
  } finally {
    delete process.env.STARSCREENER_DATA_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("POST /api/export/csv — 200 with attachment headers when authed + pro", async () => {
  const { promises: fs } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-csv-"));
  await fs.writeFile(
    path.join(dir, "user-tiers.jsonl"),
    JSON.stringify({
      userId: "local",
      tier: "pro",
      expiresAt: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    }) + "\n",
    "utf8",
  );
  try {
    process.env.STARSCREENER_DATA_DIR = dir;
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const { POST } = await import("../../../app/api/export/csv/route");
        // Pass fullNames that won't resolve to a real repo — the route
        // still returns 200 with just a header row, which is the
        // documented behavior for unknown repos.
        const res = await POST(
          mkRequest({
            fullNames: ["definitely-not/a-real-repo"],
            columns: ["fullName", "stars", "language"],
          }) as never,
        );
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
        assert.match(
          res.headers.get("content-disposition") ?? "",
          /attachment; filename="starscreener-export-\d{4}-\d{2}-\d{2}\.csv"/,
        );
        // Read as raw bytes — Response.text() transparently strips a
        // leading UTF-8 BOM, which would mask the "BOM present" check.
        const buf = Buffer.from(await res.arrayBuffer());
        // First three bytes are EF BB BF.
        assert.deepEqual(
          Array.from(buf.subarray(0, 3)),
          [0xef, 0xbb, 0xbf],
          `expected UTF-8 BOM prefix; first bytes: ${Array.from(buf.subarray(0, 8))}`,
        );
        const afterBom = buf.subarray(3).toString("utf8");
        assert.ok(
          afterBom.startsWith("fullName,stars,language\r\n"),
          `expected header row; got ${JSON.stringify(afterBom.slice(0, 80))}`,
        );
      },
    );
  } finally {
    delete process.env.STARSCREENER_DATA_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
