# AGN-799 Blocker Note (2026-05-05)

Issue: AGN-799 [BRIEF-001]
Branch: bot/marco/AGN-799
Commit: 8da44939 (`feat(brief): wire datastore brief retrieval and repo brief hero`)

## Blocker
`git push -u origin bot/marco/AGN-799` fails because the active `GITHUB_TOKEN` environment token is invalid.

Evidence:
- `gh auth status` reports:
  - `Failed to log in to github.com using token (GITHUB_TOKEN)`
  - `The token in GITHUB_TOKEN is invalid.`

## Unblock Owner
Repo operator / environment owner.

## Unblock Action
1. Replace invalid `GITHUB_TOKEN` in environment with a valid repo-scoped token (or unset it if keyring auth should be used).
2. Re-run:
   - `git push -u origin bot/marco/AGN-799`

## Notes
- `node scripts/bot-push.mjs bot/marco/AGN-799` cannot be used in this checkout because `scripts/bot-push.mjs` is missing.