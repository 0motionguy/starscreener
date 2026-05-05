# Security Policy

## Vulnerability Disclosure

If you discover a security issue in STARSCREENER / trendingrepo.com, do not open a public issue.

Report privately through GitHub Security Advisories:
- https://github.com/0motionguy/starscreener/security/advisories/new

If that channel is unavailable, open a private maintainer contact request in the repository and share only non-sensitive metadata until a private channel is confirmed.

## Report Contents

Include:
- Affected surface (route, API path, workflow, file, or environment)
- Reproduction steps and prerequisites
- Impact assessment (confidentiality, integrity, availability)
- Minimal proof of concept
- Proposed remediation, if known

Do not include real credentials, tokens, or personal data in reports.

## Response SLA

Best-effort targets:
- Acknowledgement within 3 business days
- Initial triage outcome within 7 business days
- Coordinated remediation and disclosure timeline defined during triage

## Supported Versions

Security fixes are applied to the currently deployed `main` branch:
- https://trendingrepo.com

Older tags/releases are not guaranteed to receive backports.

## Scope

In scope:
- `src/**` application and API routes
- `apps/trendingrepo-worker/**`
- `mcp/**`
- `cli/**` and `bin/**`
- `.github/workflows/**`
- Deployment/runtime configuration in this repository

Out of scope:
- Third-party provider vulnerabilities (Vercel, GitHub, Apify, Upstash, Stripe, Sentry, and similar services)
- Public dataset content quality issues in `data/**` or `.data/**` without a security impact
- Volumetric DDoS or generic internet background noise without a product-specific bypass

## Research Rules And Safe Harbor

Good-faith research is supported when all of the following are true:
- No privacy violation, data destruction, or service disruption
- No social engineering, phishing, or physical attacks
- No persistence, lateral movement, or privilege abuse beyond minimal proof
- Prompt private disclosure and reasonable coordination time

## Disclosure And Credit

After remediation, we may publish an advisory or release-note entry.
Reporter credit is optional and only included with explicit consent.

## Notes

- This project does not currently run a paid bug bounty program.
- Missing private-channel access is a blocker and should be escalated to maintainers immediately.
