// Durable Stripe event ledger + orchestrator tests.
//
// Exercises processStripeEvent against an in-memory ledger and a fake handler,
// proving the retry/idempotency/out-of-order contract the old Redis lock +
// in-memory Set got wrong.
//
// Run:
//   npx tsx --test --require ./tests/setup-server-only-stub.cjs \
//     src/lib/stripe/__tests__/event-ledger.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  LEASE_MS,
  MemoryStripeEventLedger,
  processStripeEvent,
} from "../event-ledger";
import type { HandleStripeEventResult } from "../events";

const SHA = "0".repeat(64);

function mkEvent(args: {
  id: string;
  type: string;
  created?: number;
  object?: Record<string, unknown>;
}): Stripe.Event {
  return {
    id: args.id,
    object: "event",
    type: args.type,
    api_version: "2024-11-20.acacia",
    created: args.created ?? 1_700_000_000,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: args.object ?? { id: "obj_1" } },
  } as unknown as Stripe.Event;
}

const ok = (type: string): HandleStripeEventResult => ({ handled: true, type });

test("first delivery processes + succeeds; a committed duplicate no-ops", async () => {
  const ledger = new MemoryStripeEventLedger();
  let calls = 0;
  const handle = async (): Promise<HandleStripeEventResult> => {
    calls += 1;
    return ok("customer.subscription.updated");
  };
  const e = mkEvent({
    id: "evt_ok",
    type: "customer.subscription.updated",
    object: { id: "sub_ok" },
  });

  const first = await processStripeEvent(e, ledger, handle, SHA);
  assert.equal(first.status, 200);
  assert.equal(first.body.handled, true);
  assert.equal(calls, 1);

  const dup = await processStripeEvent(e, ledger, handle, SHA);
  assert.equal(dup.status, 200);
  assert.equal(dup.body.skipReason, "duplicate");
  assert.equal(calls, 1, "handler must NOT re-run for a committed duplicate");
});

test("P0 retry-safety — a failed delivery returns 500 and REPROCESSES on retry", async () => {
  const ledger = new MemoryStripeEventLedger();
  let calls = 0;
  const e = mkEvent({
    id: "evt_fail",
    type: "customer.subscription.updated",
    object: { id: "sub_fail" },
  });

  // First delivery: transient handler failure.
  const first = await processStripeEvent(
    e,
    ledger,
    async () => {
      calls += 1;
      throw new Error("tier store unavailable");
    },
    SHA,
  );
  assert.equal(first.status, 500, "failure must be a retryable non-2xx");
  assert.equal(calls, 1);

  // Stripe retries the SAME event.id; handler now works → MUST reprocess.
  const retry = await processStripeEvent(
    e,
    ledger,
    async () => {
      calls += 1;
      return ok(e.type);
    },
    SHA,
  );
  assert.equal(retry.status, 200);
  assert.equal(retry.body.handled, true);
  assert.equal(calls, 2, "failed event must reprocess, not be acked as duplicate");
});

test("out-of-order — a stale subscription.updated after a newer succeeded event is ignored", async () => {
  const ledger = new MemoryStripeEventLedger();
  const applied: string[] = [];
  const handle = (label: string) => async (): Promise<HandleStripeEventResult> => {
    applied.push(label);
    return ok("customer.subscription.updated");
  };

  // Newer state (e.g. the cancel) commits first at event.created=2000.
  const newer = mkEvent({
    id: "evt_newer",
    type: "customer.subscription.updated",
    created: 2000,
    object: { id: "sub_race" },
  });
  await processStripeEvent(newer, ledger, handle("newer"), SHA);

  // A stale earlier event (created=1000) is delivered late → must be ignored,
  // never re-applied (this is what re-enabled canceled accounts before).
  const stale = mkEvent({
    id: "evt_stale",
    type: "customer.subscription.updated",
    created: 1000,
    object: { id: "sub_race" },
  });
  const res = await processStripeEvent(stale, ledger, handle("stale"), SHA);
  assert.equal(res.status, 200);
  assert.equal(res.body.skipReason, "stale_out_of_order");
  assert.deepEqual(applied, ["newer"], "the stale event must not re-apply");
});

test("busy — a fresh processing lease returns 409 without running the handler", async () => {
  const ledger = new MemoryStripeEventLedger();
  const e = mkEvent({
    id: "evt_busy",
    type: "customer.subscription.updated",
    object: { id: "sub_busy" },
  });
  // A concurrent worker already claimed it (fresh lease, still processing).
  await ledger.claim({
    eventId: e.id,
    eventType: e.type,
    objectId: "sub_busy",
    livemode: false,
    eventCreatedAtSec: 1000,
    payloadSha256: SHA,
  });

  let calls = 0;
  const res = await processStripeEvent(
    e,
    ledger,
    async () => {
      calls += 1;
      return ok(e.type);
    },
    SHA,
  );
  assert.equal(res.status, 409, "a live lease must ask Stripe to retry, not false-complete");
  assert.equal(calls, 0);
});

test("lease recovery — an expired processing lease is reclaimed and reprocessed", async () => {
  let clock = 1_000_000;
  const ledger = new MemoryStripeEventLedger(() => clock);
  const e = mkEvent({
    id: "evt_lease",
    type: "customer.subscription.updated",
    object: { id: "sub_lease" },
  });
  // A prior attempt claimed the lease then crashed (never marked terminal).
  await ledger.claim({
    eventId: e.id,
    eventType: e.type,
    objectId: "sub_lease",
    livemode: false,
    eventCreatedAtSec: 1000,
    payloadSha256: SHA,
  });
  // Advance past the lease window.
  clock += LEASE_MS + 1;

  let calls = 0;
  const res = await processStripeEvent(
    e,
    ledger,
    async () => {
      calls += 1;
      return ok(e.type);
    },
    SHA,
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 1, "an expired lease must be reclaimable");
});

test("unmapped event is durably IGNORED — redelivery is a duplicate, not a retry storm", async () => {
  const ledger = new MemoryStripeEventLedger();
  const e = mkEvent({ id: "evt_unknown", type: "customer.created", object: { id: "cus_1" } });

  const first = await processStripeEvent(
    e,
    ledger,
    async () => ({ handled: false, type: e.type, skipReason: "unknown_type" }),
    SHA,
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.handled, false);

  const again = await processStripeEvent(
    e,
    ledger,
    async () => ({ handled: false, type: e.type, skipReason: "unknown_type" }),
    SHA,
  );
  assert.equal(again.body.skipReason, "duplicate", "ignored is terminal");
});
