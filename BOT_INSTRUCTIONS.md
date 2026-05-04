# Paperclip bot push policy

This file defines how Paperclip-driven agents (`paperclip-vito`, `paperclip-sal`, `paperclip-carmela`, etc.) ship code into this repo.

## The rule

1. Work on a branch named `bot/<your-shortname>/<issue-id>` — e.g. `bot/vito/AGN-541`.
2. Edit files. Run `npm run typecheck && npm run lint:guards` locally; fix until green.
3. Commit with a descriptive message. Your bot identity is set automatically via `GIT_AUTHOR_*` env vars in your Paperclip `adapterConfig` — no manual `git config` needed.
4. Run `node scripts/bot-push.mjs <branch-name>` — this script handles the rest:
   - Pushes the branch to origin
   - Opens a PR with `--label auto-merge`
   - Enables auto-merge (squash)
5. Watch the PR. CI runs. If green → auto-merges → Vercel deploys. If red → fix locally, push again to the same branch.

## What you must NOT do

- ❌ Push directly to `main`. Branch protection rejects it.
- ❌ Use `git commit --no-verify` to skip Husky. The pre-commit hook is fast (~10s) and catches most issues. Bypass only if you have a documented reason.
- ❌ Open a PR without the `auto-merge` label. It will sit forever waiting for human review.
- ❌ Mark a Paperclip task `done` until `gh pr view <num> --json state` returns `MERGED` and the bot commit appears in `git log origin/main`.

## Bot identity reference

Each agent commits under its own identity so `git log` is auditable:

| Agent name | Git author |
|---|---|
| Vito / Sal / Carmela | `paperclip-vito` / `paperclip-sal` / `paperclip-carmela` |
| `[LEAD] CTO` / `[LEAD] CEO` | `paperclip-cto` / `paperclip-ceo` |
| `[ENG] Frontend` | `paperclip-frontend` |
| `[ENG] Backend` | `paperclip-backend` |
| `[ENG] Data Pipeline` | `paperclip-data` |
| `[QA] Release QA` | `paperclip-qa` |
| `[OPS] Release SRE` | `paperclip-sre` |
| `[PM] Sprint Triage` | `paperclip-sprint` |
| `[SEC] Platform Security` | `paperclip-sec` |
| `[BRIDGE] Queen` | `paperclip-queen` |

All emails are `<shortname>@bot.trendingrepo.com`.

## AISO agents are different

`[AISO/ENG] Frontend`, `[AISO/ENG] Backend`, `[AISO/QA] Quality` work in `C:\Users\mirko\OneDrive\Desktop\Agnt\aiso\` which is **NOT a git repo**. They edit files locally; deploy is via Vercel from the live aiso.tools URL using the user's manual `vercel deploy`. AISO agents do NOT run `git` commands.
