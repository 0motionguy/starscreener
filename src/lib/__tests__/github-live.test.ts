// StarScreener — github-live regression tests.
//
// Focused on the 2026-05-13 P0 fix: the live-repo cold-miss path on
// /repo/[owner]/[name] threw "Page changed from static to dynamic at runtime"
// because githubFetch defaulted to `cache: "no-store"` inside an ISR page.
// These tests pin the fetch options so a future refactor that drops the
// cache hint regresses straight to a failing test instead of bleeding to a
// production 500.

import assert from "node:assert/strict";
import { test } from "node:test";

import { synthesizeRepoFromGitHub } from "../github-live";

// ---------------------------------------------------------------------------
// 1. synthesizeRepoFromGitHub shape — every consumer of the cold-miss path
//    reads from this shape, so this test guards against a missing field
//    silently degrading a future page section to undefined-access.
// ---------------------------------------------------------------------------

test("synthesizeRepoFromGitHub produces all fields the detail page reads", () => {
  const synthetic = synthesizeRepoFromGitHub({
    full_name: "facebook/react",
    name: "react",
    owner: { login: "facebook", avatar_url: "https://avatars/face.png" },
    description: "A library for the web",
    html_url: "https://github.com/facebook/react",
    homepage: "https://react.dev",
    language: "JavaScript",
    topics: ["ui", "library"],
    stargazers_count: 234_000,
    forks_count: 49_000,
    open_issues_count: 800,
    pushed_at: "2026-05-12T10:00:00Z",
    created_at: "2013-05-24T16:15:54Z",
  });
  // Cross-source signal fields must be present (zero or null) so the
  // page renders the "tracking started" banner against an empty shape
  // rather than crashing on undefined access.
  assert.equal(synthetic.fullName, "facebook/react");
  assert.equal(synthetic.stars, 234_000);
  assert.equal(synthetic.starsDelta24h, 0);
  assert.equal(synthetic.starsDelta24hMissing, true);
  assert.equal(synthetic.starsDelta7dMissing, true);
  assert.equal(synthetic.starsDelta30dMissing, true);
  assert.equal(synthetic.momentumScore, 0);
  assert.deepEqual(synthetic.sparklineData, []);
  assert.equal(synthetic.mentions, null);
  assert.equal(synthetic.hasMovementData, false);
});

// ---------------------------------------------------------------------------
// 2. The cold-miss fetch must opt INTO Next.js's data cache so the page stays
//    statically renderable. Specifically: it must NOT inherit the
//    github-fetch helper's default cache: "no-store", and must set a finite
//    revalidate. This guards the 2026-05-13 regression by reading the source
//    directly — ESM modules are immutable so swapping the imported reference
//    at runtime isn't an option, but the call site is short enough that a
//    source-level check is reliable.
// ---------------------------------------------------------------------------

test("live-repo fetch passes cache hints that keep the ISR page renderable", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(
    path.resolve(here, "..", "github-live.ts"),
    "utf8",
  );
  // Locate the fetchFromGitHub function body — every other githubFetch caller
  // in the codebase routes through different helpers; this is the only one
  // on the ISR-rendered /repo/[owner]/[name] path.
  const match = src.match(
    /async function fetchFromGitHub[\s\S]*?await githubFetch\([\s\S]*?\);/,
  );
  assert.ok(match, "expected fetchFromGitHub to call githubFetch");
  const callSite = match[0];
  // The two regression markers — drop either of these and prod 500s on the
  // cold-miss path because Next.js 15 throws "static to dynamic at runtime".
  assert.match(
    callSite,
    /cache:\s*"force-cache"/,
    'cache: "force-cache" must be set — bare default is "no-store" which breaks ISR',
  );
  assert.match(
    callSite,
    /next:\s*\{\s*revalidate:\s*\d+/,
    "next.revalidate must be set so the fetch participates in Next data cache",
  );
});
