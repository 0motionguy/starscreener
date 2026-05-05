# AGN-484 CSP Deep-Dive Inventory (2026-05-04)

## Scope

- Runtime surfaces reviewed: `next.config.ts`, `src/**` (excluding tests), `public/**`.
- Goal: enumerate third-party browser origins and propose a strict CSP that removes broad wildcards.

## Current CSP (production)

Current header in `next.config.ts` is broad and allows scheme-wide network egress:

- `script-src 'self' 'unsafe-inline'` (`next.config.ts:99`)
- `img-src 'self' data: blob: https:` (`next.config.ts:101`)
- `font-src 'self' data: https:` (`next.config.ts:102`)
- `connect-src 'self' https: wss:` (`next.config.ts:103`)
- `frame-src 'self' https:` (`next.config.ts:104`)
- `worker-src 'self' blob:` (`next.config.ts:105`)

Risk class: `OWASP A05:Security Misconfiguration` / `CWE-693` (broad `https:` and `wss:` allowlists defeat origin-level containment).

## Third-Party Origin Inventory

### A. Browser-enforced origins (affect CSP)

1. `https://cdn.redoc.ly`
- Evidence: `public/reference.html:17`, `public/reference.html:58`
- Usage: external script load.
- CSP directive impact: `script-src`.

2. `https://us.i.posthog.com` (default) and env-configurable PostHog host
- Evidence: `src/components/providers/PostHogProvider.tsx:14`
- Usage: analytics network calls from browser SDK.
- CSP directive impact: `connect-src`.

3. `https://www.google.com` (`/s2/favicons`)
- Evidence: `src/lib/logo-url.ts:12`, `src/lib/logos.ts:194`, `src/app/mcp/page.tsx:90`, `src/app/demo/page.tsx:528`
- Usage: remote favicon images.
- CSP directive impact: `img-src`.

4. `https://avatars.githubusercontent.com`
- Evidence: `next.config.ts:55`
- Usage: remote avatar images.
- CSP directive impact: `img-src`.

5. `https://github.com`
- Evidence: `next.config.ts:56`
- Usage: remote owner/repo images (`*.png` avatar pattern).
- CSP directive impact: `img-src`.

6. `https://opengraph.githubassets.com`
- Evidence: `next.config.ts:57`
- Usage: OG-card images.
- CSP directive impact: `img-src`.

7. `https://pbs.twimg.com`
- Evidence: `next.config.ts:58`
- Usage: X/Twitter media images.
- CSP directive impact: `img-src`.

8. `https://abs.twimg.com`
- Evidence: `next.config.ts:59`
- Usage: X/Twitter static image assets.
- CSP directive impact: `img-src`.

9. `https://unavatar.io`
- Evidence: `next.config.ts:60`
- Usage: third-party avatar proxy.
- CSP directive impact: `img-src`.

10. `https://ph-files.imgix.net`
- Evidence: `next.config.ts:62`
- Usage: Product Hunt media.
- CSP directive impact: `img-src`.

11. Sentry ingest origin(s), DSN-driven
- Evidence: `instrumentation-client.ts:5` (reads `NEXT_PUBLIC_SENTRY_DSN`)
- Usage: browser telemetry egress.
- CSP directive impact: `connect-src`.
- Note: host is not hard-coded; depends on DSN. Typical pattern: `https://*.ingest.sentry.io`.

### B. Third-party URLs present but **not** CSP-enforced execution sinks

These are external links or server-to-server endpoints, not browser script execution surfaces:

- External navigation links: GitHub, X, Reddit, YouTube, Basescan, Solscan, Smithery, Glama, PulseMCP, MCP official.
- Server-side fetch endpoints: GitHub API, Reddit API, HN Algolia, Dev.to API, OpenRouter models API, Resend API, Cloudflare Turnstile verify.

Reason: CSP governs browser fetch/execute/embed behavior; server fetches are controlled by backend code and outbound network policy, not CSP.

## Proposed Strict CSP

## Candidate policy (report-only; not yet applied)

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'unsafe-inline' https://cdn.redoc.ly;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://opengraph.githubassets.com https://pbs.twimg.com https://abs.twimg.com https://unavatar.io https://www.google.com https://ph-files.imgix.net;
font-src 'self' data:;
connect-src 'self' https://us.i.posthog.com https://*.ingest.sentry.io;
frame-src 'self';
worker-src 'self' blob:;
upgrade-insecure-requests;
report-uri /api/csp/report;
```

## Delta vs current policy

- Removes scheme wildcards from `img-src`, `font-src`, `connect-src`, `frame-src`.
- Adds explicit `cdn.redoc.ly` script origin required by `public/reference.html`.
- Keeps `'unsafe-inline'` in `script-src` for now because inline scripts are present in app layout/pages (`src/app/layout.tsx:178`, `src/app/page.tsx:1085`). Next hardening step should migrate to nonce/hash.
- Restricts `connect-src` to PostHog + Sentry ingest (plus `'self'`).

## Residual Risk

- `script-src 'unsafe-inline'` remains (`OWASP A03/A05`, `CWE-79` blast radius reduction not maximal).
- `worker-src blob:` retained for compatibility; verify whether any worker path truly needs blob workers before removal.
- Sentry host is DSN-dependent; production DSN host must be confirmed and pinned exactly.

## Validation Checklist Before Rollout

1. Enable `Content-Security-Policy-Report-Only` for 24-72h with this candidate.
2. Capture violations and verify no additional required third-party origins.
3. Confirm production `NEXT_PUBLIC_POSTHOG_HOST` and Sentry DSN host; pin exact hosts.
4. Convert inline scripts to nonce/hash and remove `'unsafe-inline'` from `script-src`.
5. Promote report-only policy to enforcing CSP.
