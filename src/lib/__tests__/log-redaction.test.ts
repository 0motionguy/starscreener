import assert from "node:assert/strict";
import test from "node:test";

import { redactSensitiveText, sanitizeTelemetryValue } from "../log-redaction";

test("redactSensitiveText redacts emails and IP addresses", () => {
  const input = "user=alice@example.com ip=203.0.113.42 ipv6=2001:db8::1";
  const out = redactSensitiveText(input);
  assert.equal(out.includes("alice@example.com"), false);
  assert.equal(out.includes("203.0.113.42"), false);
  assert.equal(out.includes("2001:db8::1"), false);
  assert.equal(out.includes("[redacted-email]"), true);
  assert.equal(out.includes("[redacted-ip]"), true);
});

test("redactSensitiveText masks bearer and token values as first4+last4", () => {
  const input =
    "Authorization: Bearer abcdefghijklmnop token=abcdefghijklmnopqrstuvwxyz";
  const out = redactSensitiveText(input);
  assert.equal(out.includes("abcdefghijklmnop"), false);
  assert.equal(out.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.match(out, /Bearer\s+abcd\*\*\*\*mnop/);
  assert.match(out, /token=abcd\*\*\*\*wxyz/);
});

test("redactSensitiveText masks basic auth and signed session cookies", () => {
  const input =
    "Authorization: Basic dXNlcjpwYXNzd29yZA== Cookie: ss_admin=abcdefghijklmnopqrstuvwxyz; ss_user=zyxwvutsrqponmlkjihgfedcba";
  const out = redactSensitiveText(input);
  assert.equal(out.includes("dXNlcjpwYXNzd29yZA=="), false);
  assert.equal(out.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(out.includes("zyxwvutsrqponmlkjihgfedcba"), false);
  assert.match(out, /Basic\s+dXNl\*\*\*\*[A-Za-z0-9+/=]+/);
  assert.match(out, /ss_admin=abcd\*\*\*\*wxyz/);
  assert.match(out, /ss_user=zyxw\*\*\*\*dcba/);
});

test("sanitizeTelemetryValue redacts nested breadcrumb email fields", () => {
  const value = {
    message: "failed login for owner@example.com",
    data: {
      email: "owner@example.com",
      nested: {
        contactEmail: "dev@example.com",
        note: "notify dev@example.com",
      },
      list: ["qa@example.com", { userEmail: "ops@example.com" }],
    },
  };

  const out = sanitizeTelemetryValue(value) as {
    message: string;
    data: {
      email: string;
      nested: { contactEmail: string; note: string };
      list: unknown[];
    };
  };

  assert.equal(out.message.includes("owner@example.com"), false);
  assert.equal(out.data.email, "[redacted-email]");
  assert.equal(out.data.nested.contactEmail, "[redacted-email]");
  assert.equal(out.data.nested.note.includes("[redacted-email]"), true);
  assert.equal(String(out.data.list[0]).includes("qa@example.com"), false);
  assert.equal(
    (out.data.list[1] as { userEmail: string }).userEmail,
    "[redacted-email]",
  );
});
