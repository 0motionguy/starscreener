#!/usr/bin/env node
// One-shot Stripe seeder.
//
// Run once per environment (test-mode for staging, live-mode for prod) to
// provision the four price IDs the checkout route resolves from env:
//
//   STRIPE_PRO_MONTHLY_PRICE_ID
//   STRIPE_PRO_YEARLY_PRICE_ID
//   STRIPE_TEAM_MONTHLY_PRICE_ID
//   STRIPE_TEAM_YEARLY_PRICE_ID
//
// Idempotent: looks up existing products by `metadata.starscreener_tier` before
// creating. Safe to re-run — never duplicates products or prices. If prices
// at the same interval already exist on a product, they are reused.
//
// Uses raw fetch against the Stripe REST API instead of the Node SDK so this
// script stays dep-free (operators run it once; not worth a npm install).
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe-products.mjs
//
// Optional env overrides:
//   STRIPE_SEED_PRO_MONTHLY_CENTS   (default 2000 = $20.00)
//   STRIPE_SEED_PRO_YEARLY_CENTS    (default 19200 = $192 = $16/mo × 12)
//   STRIPE_SEED_TEAM_MONTHLY_CENTS  (default 5000 = $50.00 per seat)
//   STRIPE_SEED_TEAM_YEARLY_CENTS   (default 48000 = $480 = $40/mo × 12 per seat)
//
// Keep these in sync with `src/lib/pricing/tiers.ts` (parallel agent owns it).
// When tier prices change: update tiers.ts → rerun this script in test-mode →
// sanity-check → swap the env vars → rerun in live-mode.

import process from "node:process";

const API_BASE = "https://api.stripe.com/v1";
const TIER_META_KEY = "starscreener_tier";

const SECRET = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!SECRET) {
  console.error("ERROR: STRIPE_SECRET_KEY is not set.");
  console.error(
    "       Export your test- or live-mode secret key and rerun. Never commit this value.",
  );
  process.exit(1);
}

const DEFAULTS = {
  proMonthlyCents: parseIntEnv(process.env.STRIPE_SEED_PRO_MONTHLY_CENTS, 2000),
  proYearlyCents: parseIntEnv(process.env.STRIPE_SEED_PRO_YEARLY_CENTS, 19200),
  teamMonthlyCents: parseIntEnv(process.env.STRIPE_SEED_TEAM_MONTHLY_CENTS, 5000),
  teamYearlyCents: parseIntEnv(process.env.STRIPE_SEED_TEAM_YEARLY_CENTS, 48000),
  currency: (process.env.STRIPE_SEED_CURRENCY || "usd").toLowerCase(),
};

const PRODUCTS = [
  {
    tier: "pro",
    name: "StarScreener Pro",
    description:
      "Momentum alerts, rule engine, and weekly digest for a single analyst.",
    prices: [
      { cadence: "monthly", unitAmount: DEFAULTS.proMonthlyCents },
      { cadence: "yearly", unitAmount: DEFAULTS.proYearlyCents },
    ],
  },
  {
    tier: "team",
    name: "StarScreener Team",
    description:
      "Pro features plus shared watchlists, team digests, and per-seat billing.",
    prices: [
      { cadence: "monthly", unitAmount: DEFAULTS.teamMonthlyCents },
      { cadence: "yearly", unitAmount: DEFAULTS.teamYearlyCents },
    ],
  },
];

// ---------------------------------------------------------------------------
// Stripe REST helpers — form-encoded POST, Basic auth with empty password.
// ---------------------------------------------------------------------------

function auth() {
  // Stripe accepts Authorization: Bearer <secret> OR Basic auth with the
  // secret as the username. Bearer is simpler.
  return { Authorization: `Bearer ${SECRET}` };
}

async function stripeFetch(path, { method = "GET", params, form } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.append(k, String(v));
    }
  }

  const init = {
    method,
    headers: {
      ...auth(),
      "Stripe-Version": "2025-02-24.acacia",
    },
  };

  if (form) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = encodeForm(form);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      `Stripe ${method} ${path} failed: ${res.status} ${
        body?.error?.message || text.slice(0, 200)
      }`,
    );
    err.response = body;
    err.status = res.status;
    throw err;
  }
  return body;
}

function encodeForm(obj, prefix) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(encodeForm(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        if (typeof item === "object" && item !== null) {
          parts.push(encodeForm(item, `${key}[${idx}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${idx}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

// ---------------------------------------------------------------------------
// Product + price provisioning.
// ---------------------------------------------------------------------------

async function findProductByTier(tier) {
  // Stripe doesn't expose a metadata-indexed lookup. Use the search API —
  // indexed on metadata. Falls back to a page scan if search isn't enabled.
  try {
    const res = await stripeFetch("/products/search", {
      params: { query: `metadata['${TIER_META_KEY}']:'${tier}'`, limit: 1 },
    });
    if (res?.data?.[0]) return res.data[0];
  } catch (err) {
    if (err.status !== 400) throw err;
    // Search not enabled in test mode for some older accounts — fall back.
  }

  // Fallback: paginate /products and filter in memory. Small catalog; fine.
  let startingAfter = null;
  for (let i = 0; i < 20; i += 1) {
    const params = { limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripeFetch("/products", { params });
    for (const product of page?.data ?? []) {
      if (product?.metadata?.[TIER_META_KEY] === tier) return product;
    }
    if (!page?.has_more) break;
    startingAfter = page?.data?.[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return null;
}

async function ensureProduct(tierCfg) {
  const existing = await findProductByTier(tierCfg.tier);
  if (existing) {
    console.log(`  [product] reused ${existing.id} (${tierCfg.name})`);
    return existing;
  }
  const created = await stripeFetch("/products", {
    method: "POST",
    form: {
      name: tierCfg.name,
      description: tierCfg.description,
      metadata: { [TIER_META_KEY]: tierCfg.tier },
    },
  });
  console.log(`  [product] created ${created.id} (${tierCfg.name})`);
  return created;
}

async function listActivePrices(productId) {
  const prices = [];
  let startingAfter = null;
  for (let i = 0; i < 10; i += 1) {
    const params = { product: productId, active: "true", limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripeFetch("/prices", { params });
    for (const p of page?.data ?? []) prices.push(p);
    if (!page?.has_more) break;
    startingAfter = page?.data?.[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return prices;
}

async function ensurePrice(productId, tier, cadence, unitAmountCents) {
  const interval = cadence === "yearly" ? "year" : "month";
  const all = await listActivePrices(productId);
  const existing = all.find(
    (p) =>
      p.recurring?.interval === interval &&
      p.currency === DEFAULTS.currency &&
      p.unit_amount === unitAmountCents,
  );
  if (existing) {
    console.log(
      `    [price] reused ${existing.id}  ${cadence}  ${formatCents(
        existing.unit_amount,
        existing.currency,
      )}`,
    );
    return existing;
  }
  const created = await stripeFetch("/prices", {
    method: "POST",
    form: {
      product: productId,
      currency: DEFAULTS.currency,
      unit_amount: unitAmountCents,
      recurring: { interval },
      nickname: `${tier} ${cadence}`,
      metadata: { [TIER_META_KEY]: tier, cadence },
    },
  });
  console.log(
    `    [price] created ${created.id}  ${cadence}  ${formatCents(
      created.unit_amount,
      created.currency,
    )}`,
  );
  return created;
}

// ---------------------------------------------------------------------------
// Entrypoint.
// ---------------------------------------------------------------------------

(async () => {
  // Sanity-check: refuse to run against live mode unconditionally — force the
  // operator to set STRIPE_SEED_ALLOW_LIVE=true. Protects against a pasted
  // live-mode key running test fixtures.
  const isLive = SECRET.startsWith("sk_live_");
  if (isLive && process.env.STRIPE_SEED_ALLOW_LIVE !== "true") {
    console.error(
      "REFUSING to run against live mode. Export STRIPE_SEED_ALLOW_LIVE=true to override.",
    );
    process.exit(2);
  }

  console.log(
    `Seeding Stripe (${isLive ? "LIVE" : "test"} mode) …  currency=${DEFAULTS.currency}`,
  );

  const envLines = [];

  for (const cfg of PRODUCTS) {
    console.log(`\n▶ ${cfg.name}`);
    const product = await ensureProduct(cfg);
    const priceByCadence = {};
    for (const price of cfg.prices) {
      const created = await ensurePrice(
        product.id,
        cfg.tier,
        price.cadence,
        price.unitAmount,
      );
      priceByCadence[price.cadence] = created.id;
    }
    if (priceByCadence.monthly) {
      envLines.push(
        `STRIPE_${cfg.tier.toUpperCase()}_MONTHLY_PRICE_ID=${priceByCadence.monthly}`,
      );
    }
    if (priceByCadence.yearly) {
      envLines.push(
        `STRIPE_${cfg.tier.toUpperCase()}_YEARLY_PRICE_ID=${priceByCadence.yearly}`,
      );
    }
  }

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("Paste these into your environment (.env.local, Vercel, etc.):");
  console.log("─────────────────────────────────────────────────────────");
  for (const line of envLines) console.log(line);
  console.log("─────────────────────────────────────────────────────────\n");
  console.log("Done.");
})().catch((err) => {
  console.error("\nSeed failed:", err?.message || err);
  if (err?.response) {
    console.error(JSON.stringify(err.response, null, 2));
  }
  process.exit(1);
});

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

function parseIntEnv(raw, fallback) {
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatCents(cents, currency) {
  if (typeof cents !== "number") return "?";
  const dollars = cents / 100;
  return `${currency.toUpperCase()} ${dollars.toFixed(2)}`;
}
