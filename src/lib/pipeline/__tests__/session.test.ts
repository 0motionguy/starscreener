// StarScreener — signed-cookie session helpers.
//
// Covers sign/verify round-trip, tamper resistance, expiry, and secret-unset
// behavior. No external deps — pure node:crypto.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_MAX_AGE_MS,
  deriveUserId,
  signSession,
  verifySession,
  type SessionPayload,
} from "../../api/session";

async function withSecret<T>(
  secret: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prior = process.env.SESSION_SECRET;
  try {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    return await fn();
  } finally {
    if (prior === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prior;
  }
}

// ---------------------------------------------------------------------------
// Happy path: sign → verify round-trip.
// ---------------------------------------------------------------------------

test("signSession + verifySession: round-trip recovers payload", async () => {
  await withSecret("s" + "e".repeat(40), () => {
    const payload: SessionPayload = {
      userId: "u_abc123",
      issuedAt: Date.now(),
    };
    const token = signSession(payload);
    const recovered = verifySession(token);
    assert.ok(recovered);
    assert.equal(recovered!.userId, payload.userId);
    assert.equal(recovered!.issuedAt, payload.issuedAt);
  });
});

test("signSession produces a two-part dotted token", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const token = signSession({ userId: "u", issuedAt: Date.now() });
    const parts = token.split(".");
    assert.equal(parts.length, 2);
    assert.ok(parts[0] && parts[0].length > 0);
    assert.ok(parts[1] && parts[1].length > 0);
  });
});

// ---------------------------------------------------------------------------
// Tamper resistance.
// ---------------------------------------------------------------------------

test("verifySession: flipping a payload byte invalidates the signature", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const token = signSession({ userId: "alice", issuedAt: Date.now() });
    const [payloadB64, sigB64] = token.split(".");
    // Flip a letter in the payload — simulates an attacker changing userId.
    const corrupted = `${payloadB64!.slice(0, -1)}${payloadB64!.endsWith("A") ? "B" : "A"}.${sigB64}`;
    assert.equal(verifySession(corrupted), null);
  });
});

test("verifySession: swapping the signature half invalidates the token", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const a = signSession({ userId: "alice", issuedAt: Date.now() });
    const b = signSession({ userId: "bob", issuedAt: Date.now() });
    const [payloadA] = a.split(".");
    const [, sigB] = b.split(".");
    const frankenstein = `${payloadA}.${sigB}`;
    assert.equal(verifySession(frankenstein), null);
  });
});

test("verifySession: a token signed with a DIFFERENT secret is rejected", async () => {
  let tokenFromFirstSecret = "";
  await withSecret("secret-one-" + "x".repeat(30), () => {
    tokenFromFirstSecret = signSession({
      userId: "u",
      issuedAt: Date.now(),
    });
  });
  await withSecret("secret-two-" + "y".repeat(30), () => {
    assert.equal(verifySession(tokenFromFirstSecret), null);
  });
});

// ---------------------------------------------------------------------------
// Malformed inputs.
// ---------------------------------------------------------------------------

test("verifySession: empty / null / undefined / non-string → null", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    assert.equal(verifySession(null), null);
    assert.equal(verifySession(undefined), null);
    assert.equal(verifySession(""), null);
    // @ts-expect-error runtime robustness
    assert.equal(verifySession(42), null);
  });
});

test("verifySession: single-part / three-part tokens → null", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    assert.equal(verifySession("abc"), null);
    assert.equal(verifySession("abc.def.ghi"), null);
  });
});

test("verifySession: signature contains chars outside base64url → null", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const good = signSession({ userId: "u", issuedAt: Date.now() });
    const [payload] = good.split(".");
    const badSig = "!@#$%^&*()";
    assert.equal(verifySession(`${payload}.${badSig}`), null);
  });
});

// ---------------------------------------------------------------------------
// Expiry.
// ---------------------------------------------------------------------------

test("verifySession: token older than 30 days → null", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const aged: SessionPayload = {
      userId: "u",
      issuedAt: Date.now() - SESSION_MAX_AGE_MS - 60_000,
    };
    const token = signSession(aged);
    assert.equal(verifySession(token), null);
  });
});

test("verifySession: token 29 days old is still valid", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const fresh: SessionPayload = {
      userId: "u",
      issuedAt: Date.now() - 29 * 24 * 60 * 60 * 1_000,
    };
    const token = signSession(fresh);
    const recovered = verifySession(token);
    assert.ok(recovered);
    assert.equal(recovered!.userId, "u");
  });
});

test("verifySession: future-dated issuedAt → null (clock skew guard)", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const future: SessionPayload = {
      userId: "u",
      issuedAt: Date.now() + 5 * 60_000,
    };
    const token = signSession(future);
    assert.equal(verifySession(token), null);
  });
});

// ---------------------------------------------------------------------------
// Secret unset.
// ---------------------------------------------------------------------------

test("signSession: throws when SESSION_SECRET unset", async () => {
  await withSecret(undefined, () => {
    assert.throws(
      () => signSession({ userId: "u", issuedAt: Date.now() }),
      /SESSION_SECRET/,
    );
  });
});

test("verifySession: returns null when SESSION_SECRET unset", async () => {
  let token = "";
  await withSecret("secret-" + "x".repeat(40), () => {
    token = signSession({ userId: "u", issuedAt: Date.now() });
  });
  await withSecret(undefined, () => {
    assert.equal(verifySession(token), null);
  });
});

// ---------------------------------------------------------------------------
// deriveUserId — deterministic by email, random by anonymous.
// ---------------------------------------------------------------------------

test("deriveUserId: same email → same userId (across calls)", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const a = deriveUserId("mirko@example.com");
    const b = deriveUserId("mirko@example.com");
    assert.equal(a, b);
    assert.match(a, /^u_/);
  });
});

test("deriveUserId: email case and whitespace are normalized", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const a = deriveUserId("Mirko@Example.Com");
    const b = deriveUserId("  mirko@example.com  ");
    assert.equal(a, b);
  });
});

test("deriveUserId: different emails → different userIds", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const a = deriveUserId("alice@example.com");
    const b = deriveUserId("bob@example.com");
    assert.notEqual(a, b);
  });
});

test("deriveUserId: anonymous → random u prefix, different each call", async () => {
  await withSecret("secret-" + "x".repeat(40), () => {
    const a = deriveUserId(null);
    const b = deriveUserId(null);
    const c = deriveUserId("");
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^a_/);
    assert.match(b, /^a_/);
    assert.match(c, /^a_/);
  });
});

test("deriveUserId: changing SESSION_SECRET changes the derived userId", async () => {
  let first = "";
  await withSecret("secret-" + "1".repeat(40), () => {
    first = deriveUserId("u@example.com");
  });
  await withSecret("secret-" + "2".repeat(40), () => {
    const second = deriveUserId("u@example.com");
    assert.notEqual(first, second);
  });
});

test("deriveUserId: throws when SESSION_SECRET unset", async () => {
  await withSecret(undefined, () => {
    assert.throws(() => deriveUserId("u@example.com"), /SESSION_SECRET/);
    assert.throws(() => deriveUserId(null), /SESSION_SECRET/);
  });
});
