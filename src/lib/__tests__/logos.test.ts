import assert from "node:assert/strict";
import test from "node:test";

import {
  huggingFaceLogoUrl,
  mcpEntityLogoUrl,
  profileLogoUrl,
  repoDisplayLogoUrl,
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
