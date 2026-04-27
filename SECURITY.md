# Security Policy

## Supported versions

Security fixes target the `main` branch and the latest deployed version of TrendingRepo.

## Reporting a vulnerability

Please do not open a public GitHub issue for security reports.

Use GitHub private vulnerability reporting if it is enabled on the repository. Otherwise, contact the repository owner through GitHub and request a private security channel.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Impact and affected surfaces, if known.
- Any relevant logs or proof of concept code, without exposing third-party secrets.

## Secret handling

Never commit API keys, Stripe secrets, GitHub tokens, webhook secrets, or production environment dumps. Use `.env.local` for local development and the deployment provider's secret store for production.
