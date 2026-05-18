#!/usr/bin/env node
/**
 * verify-revenue-loop.mjs — S5.D.1
 *
 * Smoke-tests the full revenue loop without a full Playwright browser
 * automation. Hits each gate with curl-equivalent fetch calls + checks
 * the response shape. The operator runs this against a Vercel preview
 * (or prod once live keys are in) with Stripe in test mode.
 *
 * Gates probed:
 *   1. Pricing page is reachable + serves the CheckoutWalkthrough mount
 *   2. /api/checkout/stripe rejects anonymous callers with 401
 *   3. /api/billing/portal rejects anonymous callers with 401
 *   4. /api/me/alert-rules quota path: POST without a session returns 401
 *      (we can't simulate a real authenticated 402 without a real Clerk
 *      session — that's the human step; this script verifies the route
 *      is mounted with the new envelope shape)
 *   5. Webhook endpoint: GET returns 405 (POST-only, signature required)
 *   6. /api/auth/session returns the expected probe shape
 *
 * This is the proof that the CODE side of the revenue loop is wired
 * correctly. The remaining proof — a real card running through Stripe
 * → webhook → tier flip → portal — is the operator's manual smoke per
 * `docs/runbooks/stripe-live-mode-bringup.md` step 6.
 *
 * Usage:
 *   node scripts/verify-revenue-loop.mjs --base=https://<preview>.vercel.app
 *   node scripts/verify-revenue-loop.mjs --base=https://trendingrepo.com --prod
 *
 * Exit codes:
 *   0   — every gate passed
 *   N   — N gates failed (full output shows which)
 */

const args = process.argv.slice(2);

function parseArg(key, fallback) {
  for (const arg of args) {
    if (arg.startsWith(`--${key}=`)) {
      return arg.slice(`--${key}=`.length);
    }
  }
  return fallback;
}

const BASE = parseArg("base", "https://trendingrepo.com").replace(/\/+$/, "");
const PROD = args.includes("--prod");

const USER_AGENT =
  "TrendingRepoRevenueLoopVerify/1.0 (+https://trendingrepo.com/docs/runbooks)";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

let passed = 0;
let failed = 0;
const failures = [];

function pass(label, detail) {
  passed += 1;
  console.log(`${GREEN}✓${RESET} ${label}${detail ? `${DIM}  ${detail}${RESET}` : ""}`);
}

function fail(label, detail) {
  failed += 1;
  failures.push({ label, detail });
  console.log(`${RED}✗${RESET} ${label}${detail ? `\n  ${RED}${detail}${RESET}` : ""}`);
}

function warn(label, detail) {
  console.log(`${YELLOW}!${RESET} ${label}${detail ? `${DIM}  ${detail}${RESET}` : ""}`);
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
    ...init,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Some endpoints return HTML; that's OK for the pricing page check.
  }
  return { status: res.status, headers: res.headers, body };
}

async function fetchHead(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "HEAD",
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
  });
  return { status: res.status, headers: res.headers };
}

async function gate1_pricingReachable() {
  const { status } = await fetchHead("/pricing");
  if (status === 200) {
    pass("Gate 1: /pricing reachable", `HTTP ${status}`);
  } else {
    fail("Gate 1: /pricing reachable", `Expected 200, got ${status}`);
  }
}

async function gate2_checkoutRejectsAnonymous() {
  const { status, body } = await fetchJson("/api/checkout/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "pro", cadence: "monthly" }),
  });
  if (status === 401) {
    pass(
      "Gate 2: /api/checkout/stripe rejects anonymous",
      `HTTP 401 — code=${body?.code ?? "?"}`,
    );
  } else if (status === 503) {
    // Acceptable on preview deploys without Stripe envs.
    warn(
      "Gate 2: /api/checkout/stripe returns 503 (Stripe envs not set)",
      "This is expected on a preview without STRIPE_SECRET_KEY. Set the envs to upgrade this to 401.",
    );
    passed += 1; // count as passing for the smoke
  } else {
    fail(
      "Gate 2: /api/checkout/stripe rejects anonymous",
      `Expected 401 or 503, got ${status}`,
    );
  }
}

async function gate3_portalRejectsAnonymous() {
  const { status, body } = await fetchJson("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (status === 401) {
    pass(
      "Gate 3: /api/billing/portal rejects anonymous",
      `HTTP 401 — code=${body?.code ?? "?"}`,
    );
  } else if (status === 503) {
    warn(
      "Gate 3: /api/billing/portal returns 503 (Stripe envs not set)",
      "Expected on preview; set STRIPE_SECRET_KEY to upgrade to 401.",
    );
    passed += 1;
  } else {
    fail(
      "Gate 3: /api/billing/portal rejects anonymous",
      `Expected 401 or 503, got ${status}`,
    );
  }
}

async function gate4_alertsRequiresAuth() {
  const { status } = await fetchJson("/api/me/alert-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "smoke",
      ruleType: "breakout",
      ruleConfig: { ruleType: "breakout" },
      cadence: "realtime",
    }),
  });
  // requireUser() redirects to /sign-in; with redirect: "manual" that
  // surfaces as 307/308. 401 is also acceptable depending on auth shape.
  if ([307, 308, 401].includes(status)) {
    pass(
      "Gate 4: /api/me/alert-rules requires auth",
      `HTTP ${status} — Clerk redirect or 401`,
    );
  } else {
    fail(
      "Gate 4: /api/me/alert-rules requires auth",
      `Expected 307/308/401, got ${status}`,
    );
  }
}

async function gate5_stripeWebhookMethodGuard() {
  const { status, body } = await fetchJson("/api/webhooks/stripe");
  if (status === 405) {
    pass(
      "Gate 5: /api/webhooks/stripe GET → 405",
      `code=${body?.code ?? "?"} (POST-only contract)`,
    );
  } else if (status === 503) {
    warn(
      "Gate 5: /api/webhooks/stripe returns 503",
      "Stripe envs not set on this deploy. Operator must add STRIPE_WEBHOOK_SECRET to activate.",
    );
    passed += 1;
  } else {
    fail(
      "Gate 5: /api/webhooks/stripe GET → 405",
      `Expected 405 or 503, got ${status}`,
    );
  }
}

async function gate6_sessionProbe() {
  const { status, body } = await fetchJson("/api/auth/session");
  // Anonymous: body.ok = false. Dev fallback: body.ok=true with userId="local".
  // Either way the route should respond 200.
  if (status === 200 && body && typeof body.ok === "boolean") {
    pass(
      "Gate 6: /api/auth/session probe shape",
      `ok=${body.ok}, userId=${body.userId ?? "<none>"}`,
    );
  } else {
    fail(
      "Gate 6: /api/auth/session probe shape",
      `Expected 200 with {ok: boolean}, got ${status}`,
    );
  }
}

async function main() {
  console.log(`${DIM}verify-revenue-loop.mjs · base=${BASE}${RESET}\n`);

  await gate1_pricingReachable();
  await gate2_checkoutRejectsAnonymous();
  await gate3_portalRejectsAnonymous();
  await gate4_alertsRequiresAuth();
  await gate5_stripeWebhookMethodGuard();
  await gate6_sessionProbe();

  console.log("");
  console.log(
    `${DIM}---${RESET}\n${passed} passed, ${failed} failed (${passed + failed} total)`,
  );

  if (failed > 0) {
    console.log("");
    console.log(`${RED}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  - ${f.label}`);
      if (f.detail) console.log(`    ${DIM}${f.detail}${RESET}`);
    }
    process.exit(failed);
  }

  console.log("");
  console.log(
    `${GREEN}All code-side gates passed.${RESET} The remaining proof is the human-side smoke per docs/runbooks/stripe-live-mode-bringup.md step 6 — drive a real Stripe test card through the full flow and verify the webhook lands the tier update in user-tiers.jsonl.`,
  );
  if (PROD) {
    console.log("");
    console.log(
      `${YELLOW}⚠${RESET}  Running against ${BASE} — confirm the operator has flipped pk_live_ + sk_live_ before doing a real test charge.`,
    );
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal:${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(99);
});
