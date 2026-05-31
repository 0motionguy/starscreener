# Deploying TrendingRepo — retired

This document was the Vercel + Railway deploy snapshot. Both
environments are gone (Railway deleted 2026-05-26; the `starscreener`
Vercel project is paused + Git-disconnected per CLAUDE.md cross-project
policy).

**Current prod runbook → [DEPLOY-TOOLBOX.md](DEPLOY-TOOLBOX.md).**

Production runs on **TOOLBOX (193.53.40.118) behind Cloudflare** and
must return `Server: cloudflare` with no `X-Vercel-*` headers. Never
run `vercel deploy`/`promote`/`git connect`/`unpause` for `starscreener`.

The historical content of this file was removed 2026-05-30 (Wave B
hygiene). See `git log -- docs/DEPLOY.md` for the prior snapshot if you
need it for archaeology — but do not follow those steps for prod.
