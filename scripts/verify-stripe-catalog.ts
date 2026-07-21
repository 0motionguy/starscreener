// Read-only Stripe price-catalog verifier.
//
// Compares the live Stripe price objects to the code-owned tier table
// (src/lib/pricing/tiers.ts — the source of truth). Catches the runbook/price
// drift class of bug: a Stripe price provisioned at $19 while the pricing page
// charges $6.50. Mirrors scripts/verify-clerk-config.mjs.
//
//   npm run verify:stripe-catalog
//
// Skips CLEARLY without STRIPE_SECRET_KEY (it cannot query the live catalog) —
// it must never pretend to pass. Exits non-zero on any mismatch.

import { TIERS } from "@/lib/pricing/tiers";

interface Expectation {
  env: string;
  label: string;
  expectUsd: number | null;
  interval: "month" | "year";
}

const EXPECTED: Expectation[] = [
  { env: "STRIPE_PRO_MONTHLY_PRICE_ID", label: "pro/monthly", expectUsd: TIERS.pro.priceMonthlyUsd, interval: "month" },
  { env: "STRIPE_PRO_YEARLY_PRICE_ID", label: "pro/yearly", expectUsd: TIERS.pro.priceYearlyUsd, interval: "year" },
  { env: "STRIPE_TEAM_MONTHLY_PRICE_ID", label: "team/monthly", expectUsd: TIERS.team.priceMonthlyUsd, interval: "month" },
  { env: "STRIPE_TEAM_YEARLY_PRICE_ID", label: "team/yearly", expectUsd: TIERS.team.priceYearlyUsd, interval: "year" },
];

interface Result {
  label: string;
  ok: boolean;
  msg: string;
}

async function main(): Promise<void> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) {
    console.log(
      "[verify-stripe-catalog] SKIP — STRIPE_SECRET_KEY not set; cannot query the live catalog. This is NOT a pass.",
    );
    process.exit(0);
    return;
  }
  const livemode = sk.startsWith("sk_live_");
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(sk);

  const results: Result[] = [];
  for (const e of EXPECTED) {
    const priceId = process.env[e.env];
    if (!priceId) {
      results.push({ label: e.label, ok: false, msg: `${e.env} not set` });
      continue;
    }
    if (e.expectUsd === null) {
      results.push({ label: e.label, ok: true, msg: "no public price in tiers.ts (skip)" });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(priceId);
      const expectCents = Math.round(e.expectUsd * 100);
      const problems: string[] = [];
      if (price.unit_amount !== expectCents) {
        problems.push(`amount ${price.unit_amount} != ${expectCents} ($${e.expectUsd})`);
      }
      if (price.currency !== "usd") problems.push(`currency ${price.currency} != usd`);
      if (price.recurring?.interval !== e.interval) {
        problems.push(`interval ${price.recurring?.interval ?? "(none)"} != ${e.interval}`);
      }
      if (!price.active) problems.push("price is not active");
      if (price.livemode !== livemode) {
        problems.push(`livemode ${price.livemode} != key mode ${livemode}`);
      }
      results.push(
        problems.length
          ? { label: e.label, ok: false, msg: problems.join("; ") }
          : { label: e.label, ok: true, msg: `$${e.expectUsd}/${e.interval} ✓ (${priceId})` },
      );
    } catch (err) {
      results.push({
        label: e.label,
        ok: false,
        msg: `retrieve failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  let failures = 0;
  console.log(
    `[verify-stripe-catalog] mode=${livemode ? "live" : "test"} — ${results.length} price(s):`,
  );
  for (const r of results) {
    if (r.ok) console.log(`  OK   ${r.label.padEnd(14)} ${r.msg}`);
    else {
      console.error(`  FAIL ${r.label.padEnd(14)} ${r.msg}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(
      `\n[verify-stripe-catalog] ${failures} mismatch(es) — the live Stripe catalog disagrees with tiers.ts. Fix the Stripe price OR tiers.ts (with founder sign-off) before charging.`,
    );
    process.exit(1);
    return;
  }
  console.log("[verify-stripe-catalog] OK — live catalog matches code prices.");
}

main().catch((err) => {
  console.error(
    "[verify-stripe-catalog] failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
