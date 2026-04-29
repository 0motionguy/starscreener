# Security Policy

## Reporting a Vulnerability

If you discover a security issue in TrendingRepo, **please do not open a public issue.** Instead, report it privately via [GitHub's private vulnerability reporting](https://github.com/0motionguy/starscreener/security/advisories/new).

We aim to:
- Acknowledge receipt within **3 business days**
- Provide an initial assessment within **7 business days**
- Coordinate a fix and disclosure timeline with the reporter

## Supported Versions

Only the `main` branch (currently deployed to https://trendingrepo.com) receives security updates. Tagged releases prior to `v0.1.0` are not supported.

## Scope

In scope:
- The Next.js application under `src/`
- The MCP server under `mcp/`
- The CLI under `cli/` and `bin/`
- The worker microservice under `apps/trendingrepo-worker/`
- GitHub Actions workflows under `.github/workflows/`

Out of scope:
- Bundled JSON snapshots in `data/` (public, by design — these are scrape outputs)
- Third-party services (Vercel, GitHub, Apify, Upstash) — report to those vendors directly
- DDoS / rate-limit-bypass reports (the project relies on upstream provider protections)

## Recognition

We're happy to credit reporters in release notes once a fix has shipped, if desired. Let us know your preferred attribution.
