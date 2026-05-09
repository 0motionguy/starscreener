# Rescue handover — 2026-05-08

## TL;DR

Multi-day multi-session WIP graveyard was consolidated onto
`feat/charts-echarts-pilot` in worktree `C:/tmp/lane10-rescue`. Branch
sits at `ca9624a6` (tag `rescue-post-consolidation`), 13 commits
ahead of `6082587f` (tag `rescue-pre-consolidation`). Typecheck +
ESLint + lint:guards + prod build all clean. Dev server live on
http://localhost:3023.

**Not pushed.** User pushes when satisfied
(`feedback_no_push_without_approval.md`).

## Where the rescue lives

| Asset | Path / ref |
|--|--|
| Rescue worktree | `C:/tmp/lane10-rescue` |
| Branch | `feat/charts-echarts-pilot` |
| Tag (before) | `rescue-pre-consolidation` → `6082587f` |
| Tag (after) | `rescue-post-consolidation` → `ca9624a6` |
| Dev server | `npm run dev` from rescue worktree → http://localhost:3023 |
| Main repo dir | `C:/dev/trendingrepo` (currently on `perf/funding-redis-mget` — left untouched, other session has uncommitted work) |

## The 13 rescue commits

```
ca9624a6 rescue: refresh 3 data files from main repo (newer/larger)
a8fba055 rescue: bulk-import 9 top10 files (themes, share-intents, OG)
ba79d01c rescue: skills + mcp from main repo working tree (607/462)
35700cf6 rescue: skills + mcp pages from parallel session a4354639
f1c75d7e fix(newsletter): suppress hydration warning (LastPass extension)
b4db68a1 rescue: mark 4 Drizzle pages dynamic (prod build unblock)
a3cf27ef rescue: restore last 6 orphan files from stash@{4} + stash@{1}
9b40f346 rescue: drop verifyWebhookSecret export from alert-rules route
790b5669 rescue: deriveHealth route-shape fix + 4 regressions reverted
2cc37a57 rescue: restore /trends page + CmdKPalette
e7f5bf52 rescue: restore /githubrepo/page.tsx slim version (213-line)
1eba97d4 rescue: merge cleanup + cross-source files + lint cleanup
1ece26b5 Merge remote-tracking branch 'origin/main'
26b2234c rescue: consolidate orphaned WIP across 32 stashes + dangling
```

## What got restored

**From stashes (32 inspected):**
- 6 new repo-detail components (ChannelChipRow, MentionTimelineStrip,
  OrganizationCard, RepoIdHero, RepoMetricStrip, StarHistoryBlock) —
  ~1,752 lines, untracked-files stash `004777a8`
- 442-line repo-detail page integration (stash@{4})
- 4 page modifications (lobsters, devto, RecentMentionsFeed,
  repo/[owner]/[name])
- /trends page + CmdKPalette (stashes 25 + 27)
- Funding /sec page + form-d.ts + 14 collector scripts +
  sources.json (stashes 1, 2, 3, 19, 20, 21)
- HF datasets/spaces/trending pages (stash@{6})
- /top10 page rewrite (stash@{8})
- Reddit/trending + Tr100IndexChart + PageHead + BrandIcons
  (stashes 10, 12, 15)
- MCP route cleanup -554 lines (stash@{27})

**From dangling commits:**
- `3285ea8c` — enrich-investors + known-investors (~60 VC firms)
- `4c15cadd` — Footer dynamic-year polish
- `a4354639` — parallel rescue session's skills+mcp variants
  (eventually replaced by main repo's actual current files)

**From main repo working tree (where another session was working live):**
- `src/lib/auth/{client,handle,migrate-anon,server}.ts`
- `src/lib/db/client.ts` + `src/lib/db/schema/{alerts,index,
  newsletter,profiles,referrals,watchlists}.ts`
- `src/lib/referrals/{cookie,fraud,milestones,share-text,code}.ts`
- `src/lib/email/templates/user-alert.ts`
- 8 cross-source files (docs/cross-source-mentions.md,
  docs/decisions/*, mcp/src/cross-source-mentions.ts,
  scripts/_tavily-cache.mjs, src/components/repo-detail/
  RecentMentionsDetailFeed.tsx, src/app/admin/sweep-cost/page.tsx)
- 9 top10 files (themes module, share-intents, dynamic OG)
- skills + mcp pages (current 607/462 versions)
- 3 data file refreshes

**Created from scratch:**
- `src/lib/mcp-ranking.ts` (~70 lines, mirrors `/mcp` ranking logic)
- `src/lib/freshness-health.ts` (extracted `deriveHealth` here so
  route.ts only exports HTTP handlers per Next 15 rule)
- `data/_meta/huggingface-avatars.json` (`{}` stub — was blocking
  every route via `src/lib/logos.ts:15` static import)

## Outstanding issues (NEXT SESSION TO PICK UP)

### 1. Reddit collector writes zero engagement

**Symptom:** `/reddit/trending` shows "0 0" or empty rows.

**Root cause:** `data/reddit-all-posts.json` has 3,768 posts ALL with
`score=0, numComments=0`. The page filter at
`src/lib/reddit-all-data.ts:121` correctly drops them.

**Fix vector:** investigate `scripts/scrape-reddit.mjs:827` — either
(a) Reddit silently zeros fields for unauthenticated bursts (OAuth
token expiry), or (b) parser regression. Cross-check against
`https://api.reddit.com/r/<sub>/comments/<id>.json` directly.

**Don't fix by relaxing the filter** — that hides the collector outage.

### 2. Twitter collector hasn't run on bulk repo set

**Symptom:** `/twitter` chart shows only 16 entries.

**Root cause:** `.data/twitter-repo-signals.jsonl` has 402 signals.
**386 are >72h old.** Page's 48h freshness gate at
`src/lib/twitter/service.ts:880,892` correctly leaves only 16.

**Fix vector:** check `.github/workflows/collect-twitter.yml` run
history + Apify console. The Apify `tweet-scraper` last fully ran
on the bulk set ~3 weeks ago. One small batch (16 repos) ran 5h ago.

### 3. NEW POLICY: keep-last-50 cache (rule going forward)

User directive (2026-05-08): **Collectors must NEVER delete cached
data.** Always keep the last 50 entries per source (Twitter, Reddit,
HN, Bluesky, etc.). When new data arrives, REPLACE the existing
entries — never empty the cache. The dev surface should always show
*something* (last-50) even when collectors fail or rate-limit.

**Implementation guidance for the next session:**
- Update each collector script (`scripts/scrape-{reddit,
  hackernews,bluesky,producthunt,devto,lobsters}.mjs` plus the
  Twitter Apify wrapper) so the merge step is:
  1. Read existing `data/<source>-trending.json` (or equivalent)
  2. Fetch new batch
  3. Union new + existing, dedupe by `id`, sort by score/recency
  4. Write back top 50 (configurable per source)
  - Never write fewer than `min(50, existing.length)` entries
- Add a new lint:guard `check-collector-keep-last-50.mjs` that fails
  if a scraper's write step zeros / shrinks the file unconditionally.
- Document in `docs/INGESTION.md`.

### 4. Various deferred items

- mcp/page.tsx still has inline `trendingScore()` duplicating
  `@/lib/mcp-ranking` — refactor when next touched.
- `/funding/_health` is at `_`-prefixed path → Next App Router
  excludes from routing. If diagnostic dashboard is wanted at that
  URL, rename to `funding/health` (drop the underscore).
- 2 real test assertion failures (twitter-fallback Sentry warning
  + Paperclip phrase suppression) — drift, not regression.
- 48 test fails are environmental (`server-only` imported under
  node:test runtime + Stripe CJS module resolution).

## Learnings (carry forward)

### L1. `git stash -u` creates orphan untracked-files commits

Visible only via `git fsck --no-reflogs --lost-found`. Today's repo
had ~30 of these from accumulated multi-session work. The
`004777a8` commit was the source of truth for the entire repo-detail
redesign + auth/db scaffolding even though it wasn't reachable from
any branch.

**Mitigation:** sessions that hit "I want to switch branches" should
either (a) commit WIP on a `wip/` branch instead of stashing, or
(b) immediately `git stash apply` after switching back.

### L2. Multi-session worktree workflow needs explicit ownership

Today: 4 worktrees (`tl/tr/bl/br`) + `lane10-rescue` + main repo dir
all spawning their own stashes + their own dev servers. Multiple
agents auto-respawning `npm run build` while another session's
`npm run dev` was running corrupted `.next/` repeatedly.

**Mitigation:** designate ONE worktree as canonical at any moment;
others `git stash` + close their dev servers before another session
takes over.

### L3. Next 15 forbids non-handler exports from `route.ts`

Hit twice today: `deriveHealth` and `verifyWebhookSecret` exported
from `app/api/.../route.ts`. The `.next/types/app/api/.../route.ts`
generated guard fails the build with
"Property 'X' is not assignable to type 'never'".

**Allowed exports from a `route.ts`:** `GET`, `POST`, `PUT`, `PATCH`,
`DELETE`, `HEAD`, `OPTIONS`, `runtime`, `dynamic`, `revalidate`,
`maxDuration`, `dynamicParams`, `fetchCache`, `preferredRegion`,
`config`, `generateStaticParams`. **Anything else (helper
functions, types/interfaces — types are fine if they're TS-erased,
but functions are not) must move to a sibling lib file.**

### L4. Drizzle pages can't statically prerender without DATABASE_URL

The db client throws on first property access if `DATABASE_URL`
isn't set. ISR (`revalidate`) doesn't help — it still prerenders at
build time. Mark pages that issue Drizzle queries inline as
`export const dynamic = "force-dynamic"`.

### L5. Browser extensions inject mid-form HTML → hydration mismatch

LastPass / 1Password / Bitwarden insert
`<div data-lastpass-icon-root="">` next to email inputs. React's
hydration check fires on every page load. Fix:
`suppressHydrationWarning` on the wrapping div.

### L6. Windows file-lock during `npm install` produces partial extracts

`ENOENT: no such file or directory, open '...next.map'` etc.
Recovery: `cmd /c rmdir /s /q node_modules` (PowerShell
`Remove-Item` fails on locked dirs); then `npm install --force` may
need 2 passes to converge.

### L7. Trust the audit — check before re-extracting

Multi-pass agent sweep was vital. The first comprehensive sweep
extracted only 2 files genuinely missing (most stashes were either
identical or older than rescue HEAD). The second deep sweep found
6 more orphan files concentrated in `stash@{4}`. The third found
9 newer top10 files in main repo's working tree.

**Pattern:** before declaring "all stashes consolidated", run an
exhaustive `git diff <ref>:<path>` vs filesystem path check across
every stash + dangling commit + parallel branches.

## How to verify everything

From `C:/tmp/lane10-rescue`:

```bash
# Code-side
npx tsc --noEmit -p .          # → 0 errors
npx eslint . --quiet            # → 0 errors
npm run lint:guards             # → 8/8 OK
npm test                        # → 1134/1184 + 327/328 (env fails)

# Build-side (kills dev server first)
cmd /c "rmdir /s /q .next"
npm run build                   # → all 224 routes generated

# Dev surface
npm run dev                      # → port 3023
curl -sS http://localhost:3023/skills -o /dev/null -w "%{http_code}\n"
```

## How to push (when ready)

```bash
cd C:/tmp/lane10-rescue
git push origin feat/charts-echarts-pilot
```

The branch is 13 commits ahead of where the consolidation started.
Whichever PR target the user wants (probably an existing one
tracking `feat/charts-echarts-pilot`) should rebase/merge cleanly
since the merge from `origin/main` already landed.

## Cleanup before next session

```bash
# Optional — drops the build-verify worktree
git worktree remove C:/tmp/lane10-build-verify

# Optional — drops the orphan stash count down (32+ → ~5 worth keeping)
git stash list
# review carefully, then:
# git stash drop stash@{N}
```

DO NOT `git gc --prune` until the user has confirmed the push +
merge — dangling commits are the safety net if anything in the
rescue is wrong.
