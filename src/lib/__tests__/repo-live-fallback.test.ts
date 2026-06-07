import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("repo detail page falls back to bounded live GitHub lookup before 404", () => {
  const source = readFileSync("src/app/repo/[owner]/[name]/page.tsx", "utf8");

  assert.match(
    source,
    /fetchGitHubRepoLiveWithinBudget/,
    "repo detail page must import the bounded live GitHub resolver",
  );
  assert.match(
    source,
    /fetchGitHubRepoLiveWithinBudget\(\s*owner,\s*name\s*\)/,
    "repo detail page must try owner/name live fallback before notFound()",
  );
});

test("compare page falls back to bounded live GitHub lookup before 404", () => {
  const source = readFileSync("src/app/compare/[...slug]/page.tsx", "utf8");

  assert.match(
    source,
    /fetchGitHubRepoLiveWithinBudget/,
    "compare page must import the bounded live GitHub resolver",
  );
  assert.match(
    source,
    /fetchGitHubRepoLiveWithinBudget\(\s*owner,\s*name\s*\)/,
    "compare page must try live fallback before notFound()",
  );
});
