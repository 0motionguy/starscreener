// Security coverage for avatar URL host allowlisting.
//
// Run:
//   npx tsx --test src/lib/api/__tests__/avatar-url.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { AVATAR_URL_ALLOWLIST_HINT, isAllowedAvatarUrl } from "../avatar-url";

const ALLOWED_HOSTS = [
  "img.clerk.com",
  "images.clerk.dev",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "avatars.githubusercontent.com",
  "secure.gravatar.com",
  "www.gravatar.com",
  "gravatar.com",
];

test("isAllowedAvatarUrl: accepts each allowlisted HTTPS avatar host", () => {
  for (const host of ALLOWED_HOSTS) {
    assert.equal(
      isAllowedAvatarUrl(`https://${host}/avatar.png?size=96`),
      true,
      `${host} should be accepted`,
    );
  }
});

test("isAllowedAvatarUrl: rejects non-HTTPS URLs", () => {
  assert.equal(isAllowedAvatarUrl("http://img.clerk.com/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("data:image/png;base64,AAAA"), false);
  assert.equal(isAllowedAvatarUrl("javascript:alert(1)"), false);
});

test("isAllowedAvatarUrl: rejects internal hosts and IP literals", () => {
  assert.equal(isAllowedAvatarUrl("https://169.254.169.254/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("https://127.0.0.1/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("https://localhost/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("https://metadata.google.internal/avatar.png"), false);
});

test("isAllowedAvatarUrl: rejects userinfo even on an allowlisted host", () => {
  assert.equal(
    isAllowedAvatarUrl("https://avatar-user:avatar-pw@img.clerk.com/avatar.png"),
    false,
  );
});

test("isAllowedAvatarUrl: rejects unknown hosts and allowlist suffix tricks", () => {
  assert.equal(isAllowedAvatarUrl("https://evil.example/avatar.png"), false);
  assert.equal(
    isAllowedAvatarUrl("https://img.clerk.com.evil.example/avatar.png"),
    false,
  );
  assert.equal(
    isAllowedAvatarUrl("https://avatars.githubusercontent.com.evil.example/avatar.png"),
    false,
  );
  assert.equal(isAllowedAvatarUrl("https://evil.img.clerk.com/avatar.png"), false);
});

test("AVATAR_URL_ALLOWLIST_HINT: names supported provider hosts", () => {
  assert.match(AVATAR_URL_ALLOWLIST_HINT, /img\.clerk\.com/);
  assert.match(AVATAR_URL_ALLOWLIST_HINT, /avatars\.githubusercontent\.com/);
  assert.match(AVATAR_URL_ALLOWLIST_HINT, /gravatar\.com/);
});
