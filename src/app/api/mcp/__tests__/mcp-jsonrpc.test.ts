/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for the HTTP MCP route handler at /api/mcp (SAM-06 / AGN-947).
//
// These tests exercise the JSON-RPC dispatcher directly via the `__test__`
// export so we don't have to spin up a Next.js server to verify the
// `tools/list` and `initialize` envelopes. Tool-call dispatch is tested
// with a single happy-path flow against an injected NextRequest whose
// origin we override on a stubbed global.fetch.

import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../route";

// Cast as any to construct a NextRequest-like object without pulling in
// the full Next.js runtime — the dispatcher only reads `.url` for origin
// resolution and never touches NextRequest internals.
function fakeRequest(): any {
  return { url: "http://localhost:3023/api/mcp" };
}

test("initialize returns the protocol version + server info", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
  });
  assert.ok(response, "expected a response (not a notification)");
  assert.equal(response!.jsonrpc, "2.0");
  assert.equal(response!.id, 1);
  assert.ok("result" in response!, "expected success envelope");
  const result = (response as { result: any }).result;
  assert.equal(result.protocolVersion, __test__.PROTOCOL_VERSION);
  assert.equal(result.serverInfo.name, "trendingrepo");
  assert.ok(result.capabilities.tools, "tools capability advertised");
});

test("tools/list returns exactly the 4 SAM-06 tools with required shape", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    id: "list-1",
    method: "tools/list",
  });
  assert.ok(response);
  assert.ok("result" in response!);
  const result = (response as { result: any }).result;
  assert.ok(Array.isArray(result.tools), "tools must be an array");
  const names = result.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(names, [
    "get_mentions",
    "get_repo",
    "get_trending",
    "search_repos",
  ]);
  for (const tool of result.tools) {
    assert.equal(typeof tool.name, "string", "name is a string");
    assert.equal(typeof tool.description, "string", "description is a string");
    assert.equal(
      tool.inputSchema.type,
      "object",
      `${tool.name} inputSchema is an object schema`,
    );
  }
});

test("unknown method returns JSON-RPC -32601", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    id: 99,
    method: "tools/nonsense",
  });
  assert.ok(response);
  assert.ok("error" in response!);
  assert.equal((response as { error: any }).error.code, -32601);
});

test("invalid envelope (missing method) returns -32600", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    id: 7,
  } as any);
  assert.ok(response);
  assert.ok("error" in response!);
  assert.equal((response as { error: any }).error.code, -32600);
});

test("notifications/initialized as a notification produces no response", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  assert.equal(response, null, "notifications must not produce a response");
});

test("tools/call get_trending wires through to /api/repos with correct query", async () => {
  // Stub global.fetch to capture the URL the dispatcher hits and return a
  // canned payload. We only assert on the URL shape; the response body is
  // pass-through to the model.
  const seenUrls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const u = typeof input === "string" ? input : input.url;
    seenUrls.push(u);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, repos: [], meta: {} }),
    } as any;
  }) as any;
  try {
    const response = await __test__.dispatch(fakeRequest(), {
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: "get_trending",
        arguments: { window: "24h", limit: 5 },
      },
    });
    assert.ok(response);
    assert.ok("result" in response!);
    const result = (response as { result: any }).result;
    assert.equal(result.isError, false);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, "text");
    // structuredContent should be the parsed upstream payload.
    assert.deepEqual(result.structuredContent, {
      ok: true,
      repos: [],
      meta: {},
    });
    assert.equal(seenUrls.length, 1);
    const url = seenUrls[0];
    assert.ok(
      url.startsWith("http://localhost:3023/api/repos?"),
      `expected origin-anchored /api/repos URL, got: ${url}`,
    );
    assert.ok(url.includes("period=today"), "24h must map to period=today");
    assert.ok(url.includes("limit=5"));
    assert.ok(url.includes("sort=momentum"));
  } finally {
    globalThis.fetch = original;
  }
});

test("tools/call get_repo rejects bogus owner with -32602", async () => {
  const response = await __test__.dispatch(fakeRequest(), {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "get_repo",
      arguments: { owner: "bad/slash", name: "x" },
    },
  });
  assert.ok(response);
  assert.ok("error" in response!);
  assert.equal((response as { error: any }).error.code, -32602);
});
