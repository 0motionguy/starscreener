import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("operator freshness audit script uses the live production health gate", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["audit:freshness"],
    "node scripts/check-live-production-health.mjs",
  );
});

test("validateSourceHealthBody rejects legacy source-health schema without attempt fields", () => {
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
});

test("validateSourceHealthBody accepts unattempted cold source breakers", () => {
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

  assert.deepEqual(errors, []);
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
