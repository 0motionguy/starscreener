# Portal v0.1 schema + lean validator — vendored

**Source:** Portal spec repo at `C:/Users/mirko/OneDrive/Desktop/visitportal.dev`
(git tag `v0.1.0` — commit freezing the v0.1 spec on 2026-04-19).

**Vendored artifacts:**
- `manifest-v0.1.0.json` — copied verbatim from
  `visitportal.dev/packages/spec/manifest.schema.json`. Kept here for
  documentation + conformance test reference. The runtime validator below
  does NOT consume this JSON at runtime; it re-encodes the rules in
  dependency-free TypeScript.
- `../validate.ts` — TypeScript port of
  `visitportal.dev/packages/spec/conformance/lean-validator.ts`. Per the
  spec self-test that repo runs on every CI, the lean validator is
  byte-for-byte decision-equivalent with the AJV-backed validator for
  every vector in `vectors.json`.

**Why vendor instead of `npm install @visitportal/spec`:** that package is
private to the spec monorepo and lives behind pnpm workspace plumbing; it
also carries node-only deps (ajv + ajv-formats) that we don't want in the
Next.js bundle. Vendoring a ~200-line validator keeps Star Screener's
agent surface self-contained.

## Re-sync procedure

When the Portal spec publishes v0.1.x or v0.2:

1. Diff:
   ```bash
   diff C:/Users/mirko/OneDrive/Desktop/visitportal.dev/packages/spec/manifest.schema.json \
        src/portal/schema/manifest-v0.1.0.json
   diff C:/Users/mirko/OneDrive/Desktop/visitportal.dev/packages/spec/conformance/lean-validator.ts \
        src/portal/validate.ts
   ```
2. Port changes into both files together (they must stay in lockstep).
3. Bump the comment header "Schema source: commit <sha>" in
   `src/portal/validate.ts`.
4. Re-run `npm test` and the upstream conformance runner (see
   `docs/protocols/portal.md`).
