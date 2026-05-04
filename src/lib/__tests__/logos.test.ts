import assert from "node:assert/strict";
import test from "node:test";

import {
  huggingFaceLogoUrl,
  mcpEntityLogoUrl,
  profileLogoUrl,
  repoDisplayLogoUrl,
  repoLogoUrl,
} from "../logos";

test("repoDisplayLogoUrl prefers a captured repo avatar", () => {
  assert.equal(
    repoDisplayLogoUrl("vercel/next.js", "https://avatars.example/vercel.png", 48),
    "https://avatars.example/vercel.png",
  );
});

test("repoDisplayLogoUrl falls back to the GitHub owner avatar", () => {
  assert.equal(
    repoDisplayLogoUrl("vercel/next.js", "", 48),
    "https://github.com/vercel.png?size=48",
  );
});

test("profileLogoUrl resolves GitHub handles for profile headers", () => {
  assert.equal(profileLogoUrl("@mirko", 40), "https://github.com/mirko.png?size=40");
});

test("huggingFaceLogoUrl uses a stable HF asset, not per-author avatar endpoints", () => {
  const url = huggingFaceLogoUrl();
  assert.match(url, /^https:\/\/huggingface\.co\//);
  assert.doesNotMatch(url, /avatar\.png$/);
});

test("mcpEntityLogoUrl prefers linked repo avatars when explicit logos are absent", () => {
  assert.equal(
    mcpEntityLogoUrl(
      {
        logoUrl: null,
        linkedRepo: "modelcontextprotocol/servers",
        url: "https://mcp.so/server/github",
        title: "GitHub MCP",
      },
      40,
    ),
    "https://github.com/modelcontextprotocol.png?size=40",
  );
});

test("mcpEntityLogoUrl falls back to registry favicons for MCP rows", () => {
  assert.equal(
    mcpEntityLogoUrl(
      {
        logoUrl: null,
        linkedRepo: null,
        url: "https://mcp.so/server/example",
        title: "Example MCP",
      },
      64,
    ),
    "https://www.google.com/s2/favicons?domain=mcp.so&sz=64",
  );
});

test("repoLogoUrl composes the GitHub owner avatar URL with the requested size", () => {
  assert.equal(
    repoLogoUrl("vercel/next.js", 64),
    "https://github.com/vercel.png?size=64",
  );
});

test("repoLogoUrl defaults to size=40 when no size is provided", () => {
  assert.equal(repoLogoUrl("vercel/next.js"), "https://github.com/vercel.png?size=40");
});

test("repoLogoUrl encodes owner segments to keep the URL well-formed", () => {
  assert.equal(
    repoLogoUrl("my org/repo", 40),
    "https://github.com/my%20org.png?size=40",
  );
});

test("repoLogoUrl returns null for empty, whitespace, or nullish input", () => {
  assert.equal(repoLogoUrl(""), null);
  assert.equal(repoLogoUrl(null), null);
  assert.equal(repoLogoUrl(undefined), null);
  assert.equal(repoLogoUrl("   "), null);
});

test("repoLogoUrl gracefully falls back when the owner half is missing", () => {
  // Malformed: leading slash means the split owner is empty → null, not a broken URL.
  assert.equal(repoLogoUrl("/orphan-repo"), null);
});

test("repoLogoUrl tolerates a bare owner with no `/name` half", () => {
  assert.equal(repoLogoUrl("vercel", 40), "https://github.com/vercel.png?size=40");
});

test("mcpEntityLogoUrl ignores invalid registry logo URLs", () => {
  assert.equal(
    mcpEntityLogoUrl(
      {
        logoUrl: "https://www.google.com/s2/favicons?domain=smithery.invalid&sz=64",
        linkedRepo: null,
        url: "https://smithery.invalid/server/example",
        title: "Example MCP",
        sourceLabel: "MCP registries",
      },
      64,
    ),
    "https://www.google.com/s2/favicons?domain=mcp.so&sz=64",
  );
});
