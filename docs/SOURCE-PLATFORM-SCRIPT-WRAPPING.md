# Wrapping a standalone collector script as a registered source

Move 1 / Phase 4 of the Source Platform migration registers the 17 standalone
`scripts/scrape-*.mjs` (and `collect-*.ts`) collectors as platform sources
without changing what they do. Each wrapped script becomes auditable against
[`apps/trendingrepo-worker/src/platform/sources.json`](../apps/trendingrepo-worker/src/platform/sources.json)
and emits a structured `[run-summary]` line that the worker's run summaries
already follow.

## What the shim handles for free

[`scripts/_source-script-runner.mjs`](../scripts/_source-script-runner.mjs)
exports one function:

```js
import { runAsRegisteredSource } from "./_source-script-runner.mjs";

await runAsRegisteredSource({
  sourceId: "bluesky",
  run: async () => { /* …existing collection logic… */ },
});
```

Behaviour the shim adds (collection logic untouched):

- **Registry verification.** Loads `apps/trendingrepo-worker/src/platform/sources.json`
  on first call, looks up `sourceId`. If the slug is missing, logs a single
  stderr warning — does NOT block the run (registry drift is a control-plane
  problem, not a collection failure).
- **Run summary.** Emits a single stdout line per run:
  `[run-summary] source=<id> status=<ok|error> duration_ms=<ms>` (plus
  `error="…"` on failure). GHA log-shippers can grep this identically across
  worker fetchers and standalone scripts.
- **Re-throws on error.** The wrapped run()'s rejection is re-raised so the
  GitHub Actions step is marked failed — exactly as before. The shim never
  swallows.

What the shim does NOT do:

- It does **not** mutate the caller's behaviour around `process.exit` /
  `process.exitCode`, meta-sidecar writes, or `closeDataStore()` cleanup.
  Those stay in the script's existing `.then/.catch/.finally` chain.
- It does **not** import worker `.ts` code — scripts run as plain `node` so
  the registry JSON is read directly.
- It does **not** consume anything from the contract row beyond `id`. Move 3
  will start using `freshness_budget_ms`, `cost_signal_metric`, etc. for
  enforcement; Phase 4 only proves the registration trace.

## How to wrap a remaining script

1. Confirm the script's slug is already in `sources.json`. If not, add a
   contract row first (see [`docs/SOURCE-FLEET-AUDIT-2026-05-07.md`](./SOURCE-FLEET-AUDIT-2026-05-07.md)
   for the row format).
2. Add the import near the other shared-helper imports:
   ```js
   import { runAsRegisteredSource } from "./_source-script-runner.mjs";
   ```
3. Find the script's bottom block where `main()` is invoked (usually inside
   an `if (isDirectRun)` gate, or unconditionally for scripts like
   `scrape-openai-rss.mjs`). Replace the bare `main()` call with:
   ```js
   runAsRegisteredSource({
     sourceId: "<your-slug>",
     run: main,
   })
   ```
   Keep the surrounding `.then(...).catch(...).finally(closeDataStore)`
   chain exactly as-is.
4. Verify nothing else changed: `git diff scripts/<your-script>.mjs` should
   show only the import + the `main` → `runAsRegisteredSource({...})` swap.
5. Run the script's existing test if one exists
   (`npm run test:<slug>` — see `package.json` scripts/test:* family).
6. Trigger the GH Actions workflow once and confirm the new
   `[run-summary] source=<slug> status=ok duration_ms=…` line appears in the
   workflow log.

## What a contract row needs

Reference: [`apps/trendingrepo-worker/src/platform/source-contract.ts`](../apps/trendingrepo-worker/src/platform/source-contract.ts)
(`SourceContract` type — 16 fields). At minimum a script-backed source
declares: `id`, `category`, `kind`, `state`, `freshness_budget_ms`,
`cost_signal_metric`, `owner` (`UNASSIGNED` allowed in Phase 1),
`upstream_url`, `auth_required`, `primary_output_keys`, `output_record_shape`,
`consumer_surfaces`, `depends_on`, `supports_backfill`, `fallback_strategy`.
The contract row does not reference the script path — the verifier
(`npm run verify:sources`, see Phase 1B) cross-checks that every script slug
has a row.

## Status: 3 of 17 wrapped

Migrated in this PR:

- `scripts/scrape-bluesky.mjs` (sourceId `bluesky`, social)
- `scripts/scrape-arxiv.mjs` (sourceId `arxiv`, research)
- `scripts/scrape-openai-rss.mjs` (sourceId `openai-rss`, research)

The remaining 14 are tracked as a follow-up "phase 4 backfill" task — they
are functionally identical wraps and can be done as a single batch once the
pattern is socialised.
