// Test seams for src/app/api/webhooks/stripe/route.ts.
//
// Lives in a sibling file (not route.ts) because Next.js's app-router
// type validator rejects any export from a route module that isn't one of
// the recognised route handlers (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS,
// generateStaticParams, etc.). Exporting __set/__resetXxxForTests directly
// from route.ts produced TS2344 in `.next/types/app/api/webhooks/stripe/route.ts`.
//
// Pattern mirrors src/app/api/cron/freshness/state/_test-hooks.ts (wave3).

import * as Sentry from "@sentry/nextjs";

import {
  handleStripeEvent,
} from "@/lib/stripe/events";
import { acquireStripeEventLock } from "@/lib/stripe/idempotency";

// ---------------------------------------------------------------------------
// Mutable state holders (module-level singletons shared with route.ts via
// the getter functions below).
// ---------------------------------------------------------------------------

let sentryCaptureException: typeof Sentry.captureException = Sentry.captureException;
let stripeEventHandler: typeof handleStripeEvent = handleStripeEvent;
let stripeEventLockAcquirer: typeof acquireStripeEventLock = acquireStripeEventLock;

// ---------------------------------------------------------------------------
// Getters — route.ts calls these at use-time so test overrides applied after
// import are still picked up (same pattern as resolveInspectSource in wave3).
// ---------------------------------------------------------------------------

export function getSentryCaptureException(): typeof Sentry.captureException {
  return sentryCaptureException;
}

export function getStripeEventHandler(): typeof handleStripeEvent {
  return stripeEventHandler;
}

export function getStripeEventLockAcquirer(): typeof acquireStripeEventLock {
  return stripeEventLockAcquirer;
}

// ---------------------------------------------------------------------------
// Test seam setters / resetters
// ---------------------------------------------------------------------------

export function __setStripeWebhookSentryCaptureForTests(
  capture: typeof Sentry.captureException,
): void {
  sentryCaptureException = capture;
}

export function __resetStripeWebhookSentryCaptureForTests(): void {
  sentryCaptureException = Sentry.captureException;
}

export function __setStripeWebhookEventHandlerForTests(
  handler: typeof handleStripeEvent,
): void {
  stripeEventHandler = handler;
}

export function __resetStripeWebhookEventHandlerForTests(): void {
  stripeEventHandler = handleStripeEvent;
}

export function __setStripeWebhookLockAcquirerForTests(
  acquirer: typeof acquireStripeEventLock,
): void {
  stripeEventLockAcquirer = acquirer;
}

export function __resetStripeWebhookLockAcquirerForTests(): void {
  stripeEventLockAcquirer = acquireStripeEventLock;
}
