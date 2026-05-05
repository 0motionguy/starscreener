# AGN-400 Dependency Audit Evidence (2026-05-04)

Scope: dependency vulnerability audit evidence for Audit-08 T5.

## Commands and timestamps

- `npm audit --json` at `2026-05-04T13:51Z`
- `npm audit --omit=dev --json` at `2026-05-04T13:52Z`

## Results

- Full dependency graph: `8` moderate vulnerabilities, `0` high, `0` critical.
- Production-only graph: `3` moderate vulnerabilities, `0` high, `0` critical.

### Production vulnerabilities

1. `resend` (direct) via `svix`
   - advisory chain includes `uuid` bounds-check issue
   - npm fix suggestion points to `resend@6.1.3` and marks as semver-major relative to current graph
2. `svix` (transitive via `resend`)
3. `uuid` (transitive via `svix`)
   - advisory: `GHSA-w5hq-g745-h8pq`

### Dev/test-only vulnerabilities

- `vitest` / `vite` / `vite-node` / `@vitest/mocker` / `esbuild`
  - advisory highlights include `GHSA-4w7w-66w2-5vf9` and `GHSA-67mh-4wv8-2f99`
  - npm fix suggestion: `vitest@4.1.5` (semver-major)

## Security interpretation

- No high/critical findings at this heartbeat.
- Production risk is concentrated in the `resend` webhook dependency chain.
- Dev/test risk is concentrated in the `vitest`/`vite` toolchain.

## Proposed remediation split

1. Production remediation track:
   - evaluate and apply safe `resend` upgrade path that clears `svix`/`uuid` advisories
   - validate webhook signing and outbound mail paths after upgrade
2. Dev/test remediation track:
   - plan `vitest` major upgrade and lockfile refresh
   - run focused test and CI validation post-upgrade
