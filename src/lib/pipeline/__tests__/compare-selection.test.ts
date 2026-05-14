import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareIdToFallbackFullName,
  resolveCompareFullNames,
} from "../../compare-selection";

test("resolveCompareFullNames preserves exact GitHub names from resolved repos", () => {
  const fullNames = resolveCompareFullNames(
    ["ggml-org--llama-cpp", "tencent-hunyuan--hy-world-2-0"],
    [
      { id: "ggml-org--llama-cpp", fullName: "ggml-org/llama.cpp" },
      {
        id: "tencent-hunyuan--hy-world-2-0",
        fullName: "Tencent-Hunyuan/HY-World-2.0",
      },
    ],
  );

  assert.deepEqual(fullNames, [
    "ggml-org/llama.cpp",
    "Tencent-Hunyuan/HY-World-2.0",
  ]);
});

test("compareIdToFallbackFullName remains best-effort when a repo is unresolved", () => {
  assert.equal(
    compareIdToFallbackFullName("ggml-org--llama-cpp"),
    "ggml-org/llama-cpp",
  );
  assert.equal(compareIdToFallbackFullName("owner/repo"), "owner/repo");
});

test("resolveCompareFullNames uses overrides for unresolved compare ids", () => {
  const fullNames = resolveCompareFullNames(
    ["vercel--next-js", "openai--codex"],
    [],
    {
      "vercel--next-js": "vercel/next.js",
      "openai--codex": "openai/codex",
    },
  );

  assert.deepEqual(fullNames, ["vercel/next.js", "openai/codex"]);
});
