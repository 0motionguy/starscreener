import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateAppHealthBody,
  validateSourceHealthBody,
} from "../check-live-production-health.mjs";

test("validateAppHealthBody rejects legacy app health without workerStatus", () => {
  const errors = validateAppHealthBody({
    status: "ok",
    sourceStatus: "ok",
  });

  assert.match(errors.join("\n"), /workerStatus must be ok/);
});

test("validateAppHealthBody rejects degraded workerStatus", () => {
  const errors = validateAppHealthBody({
    status: "ok",
    sourceStatus: "ok",
    workerStatus: "degraded",
  });

  assert.match(errors.join("\n"), /workerStatus must be ok/);
});

test("validateAppHealthBody accepts strict green app health", () => {
  assert.deepEqual(
    validateAppHealthBody({
      status: "ok",
      sourceStatus: "ok",
      workerStatus: "ok",
    }),
    [],
  );
});

test("validateSourceHealthBody rejects legacy source-health schema without attempt proof", () => {
  const errors = validateSourceHealthBody({
    summary: {
      total: 1,
      closed: 1,
      open: 0,
      halfOpen: 0,
      disabled: 0,
    },
    sources: {
      hackernews: {
        state: "CLOSED",
        totalAttempts: 0,
      },
    },
  });

  assert.match(errors.join("\n"), /summary\.neverAttempted is missing/);
  assert.match(errors.join("\n"), /hackernews: attempted flag is missing/);
  assert.match(errors.join("\n"), /hackernews: source breaker has no runtime attempt proof/);
});

test("validateSourceHealthBody rejects unattempted active source breakers", () => {
  const errors = validateSourceHealthBody({
    summary: {
      total: 1,
      closed: 1,
      open: 0,
      halfOpen: 0,
      disabled: 0,
      neverAttempted: 1,
      neverAttemptedSources: ["bluesky"],
    },
    sources: {
      bluesky: {
        state: "CLOSED",
        attempted: false,
        totalAttempts: 0,
      },
    },
  });

  assert.match(errors.join("\n"), /unproven source breaker/);
  assert.match(errors.join("\n"), /bluesky: source breaker has no runtime attempt proof/);
});

test("validateSourceHealthBody accepts proven active source breakers", () => {
  assert.deepEqual(
    validateSourceHealthBody({
      summary: {
        total: 1,
        closed: 1,
        open: 0,
        halfOpen: 0,
        disabled: 0,
        neverAttempted: 0,
        neverAttemptedSources: [],
      },
      sources: {
        devto: {
          state: "CLOSED",
          attempted: true,
          totalAttempts: 3,
        },
      },
    }),
    [],
  );
});
