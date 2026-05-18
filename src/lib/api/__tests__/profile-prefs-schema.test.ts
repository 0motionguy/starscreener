// Coverage for PATCH /api/me/profile request schema security rules.
//
// Run:
//   npx tsx --test src/lib/api/__tests__/profile-prefs-schema.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { patchProfilePrefsSchema } from "../alert-rules/schemas";

test("patchProfilePrefsSchema: accepts empty avatarUrl so the route can clear it", () => {
  const empty = patchProfilePrefsSchema.parse({ avatarUrl: "" });
  const whitespace = patchProfilePrefsSchema.parse({ avatarUrl: "   " });

  assert.equal(empty.avatarUrl, "");
  assert.equal(whitespace.avatarUrl, "   ");
});

test("patchProfilePrefsSchema: accepts allowlisted avatarUrl hosts", () => {
  const parsed = patchProfilePrefsSchema.parse({
    avatarUrl: "https://avatars.githubusercontent.com/u/12345?v=4",
  });

  assert.equal(
    parsed.avatarUrl,
    "https://avatars.githubusercontent.com/u/12345?v=4",
  );
});

test("patchProfilePrefsSchema: rejects non-allowlisted non-empty avatarUrl", () => {
  const parsed = patchProfilePrefsSchema.safeParse({
    avatarUrl: "https://evil.example/avatar.png",
  });

  assert.equal(parsed.success, false);
  assert.match(
    parsed.error.issues[0]?.message ?? "",
    /avatar URL host is not in the allowlist/,
  );
});
