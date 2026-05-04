import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relPath) {
  return readFile(path.join(root, relPath), "utf8");
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    throw new Error(`missing "${needle}" in ${context}`);
  }
}

async function main() {
  const instrumentation = await read("instrumentation.ts");
  const instrumentationClient = await read("instrumentation-client.ts");
  const workerSentry = await read("apps/trendingrepo-worker/src/lib/sentry.ts");
  const workerIndex = await read("apps/trendingrepo-worker/src/index.ts");

  assertIncludes(
    instrumentation,
    "export const onRequestError = Sentry.captureRequestError;",
    "instrumentation.ts",
  );
  assertIncludes(
    instrumentationClient,
    "export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;",
    "instrumentation-client.ts",
  );
  assertIncludes(workerSentry, "Sentry.init({", "apps/trendingrepo-worker/src/lib/sentry.ts");
  assertIncludes(workerSentry, "if (!env.SENTRY_DSN) return;", "apps/trendingrepo-worker/src/lib/sentry.ts");
  assertIncludes(workerIndex, "initSentry();", "apps/trendingrepo-worker/src/index.ts");

  console.log(
    JSON.stringify(
      {
        ok: true,
        verifiedAt: new Date().toISOString(),
        checks: [
          "instrumentation.ts:onRequestError",
          "instrumentation-client.ts:onRouterTransitionStart",
          "worker sentry init",
          "worker index initSentry call",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[verify-sentry-wiring] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
