# PostHog Funnels

**Owner:** Frontend Polish · **Issue:** AGN-848 · **Status:** events shipping (visualisation lives in PostHog)

This doc enumerates every named PostHog funnel event the web app emits.
The events are stable API contracts — PostHog dashboards key on them.
Rename or remove only with a coordinated dashboard update.

The PostHog client SDK (`posthog-js`) is initialised in
`src/components/providers/PostHogProvider.tsx`. Funnel call sites use
the helper at `src/lib/analytics/funnel.ts`, which exposes a single
`captureFunnelStep({ step, flow, ...properties })` function. Two
ergonomic wrappers ride on top of the helper:

- `<FunnelMount step flow properties? />` —
  `src/components/analytics/FunnelMount.tsx`. Fires once on mount. Use
  from server components that just need to record a page view.
- `<TrackedExternalLink step flow trackProps? ... />` —
  `src/components/analytics/TrackedExternalLink.tsx`. Drop-in
  replacement for `<a target="_blank">` when the parent is a server
  component but the click should still emit a funnel step.

If both `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_TOKEN` are unset
(preview / local dev without analytics provisioned), the helper is a silent
no-op.

The client is configured for explicit analytics only: autocapture, feature
flags, surveys, product tours, conversations, session recording, web-vitals
capture, and external PostHog extension loading are disabled. Re-enable those
only with a matching product/dashboard owner and a fresh performance check.
The SDK is loaded from PostHog's slim client bundle; `$pageview` is captured
by `src/components/analytics/PostHogPageviewBridge.tsx` instead of the SDK's
history-autocapture extension.

All funnel events share the same PostHog event name (`funnel_step`) and
are differentiated by the `step` and `flow` properties — this lets the
PostHog UI build funnels from a single event series filtered by `flow`,
which is much simpler to maintain than one named event per step.

---

## Flows

### `discover-repo` — home → search → repo → GitHub click

| # | Step | Fired from | Notable extra properties |
| - | ---- | ---------- | ------------------------ |
| 1 | `home_view` | `<FunnelMount>` in `src/app/page.tsx` | — |
| 2 | `search_query` | `src/components/shared/SearchBar.tsx` (Enter + "See all results" footer) | `query_length`, `source` (`enter_key` \| `see_all_results`) |
| 2′ | `search_result_select` | `src/components/shared/SearchBar.tsx` autocomplete row click — short-cut into the funnel that bypasses `/search` | `repo` |
| 3 | `repo_view` | `<FunnelMount>` in `src/app/repo/[owner]/[name]/page.tsx` | `repo` |
| 4 | `github_click` | `<TrackedExternalLink>` (header `↗`, id-actions "GitHub ↗") + `RepoActionRow` "OPEN ON GITHUB" | `repo`, `position` (`header` \| `id_actions` \| `repo_detail`) |

Either `search_query` *or* `search_result_select` advances the funnel
from step 2 — PostHog funnels can express "any of these events" via
the union UI.

### `top10-discover` — home → /top10 → repo → GitHub click

| # | Step | Fired from | Notable extra properties |
| - | ---- | ---------- | ------------------------ |
| 1 | `home_view` | shared with `discover-repo` | — |
| 2 | `top10_view` | `<FunnelMount>` in `src/app/top10/page.tsx` | — |
| 3 | `repo_view` | shared with `discover-repo` | `repo` |
| 4 | `github_click` | shared with `discover-repo` | `repo`, `position` |

### `watchlist-add` — repo → save

| # | Step | Fired from | Notable extra properties |
| - | ---- | ---------- | ------------------------ |
| 1 | `repo_view` | shared with `discover-repo` | `repo` |
| 2 | `watchlist_add` | `RepoActionRow.handleWatch` — only counts adds, not removes | `repo`, `source` (`repo_detail`) |

### `compare-add` - repo to compare tool

| # | Step | Fired from | Notable extra properties |
| - | ---- | ---------- | ------------------------ |
| 1 | `repo_view` | shared with `discover-repo` | `repo` |
| 2 | `compare_add` | `RepoActionRow.handleCompare`, only counts adds, not removes | `repo`, `source` (`repo_detail`), `compare_count` |
| 3 | `compare_view` | `<FunnelMount>` in `src/app/compare/page.tsx` | - |

### `submit-repo` — open form → fill → submit

Lives on `/submit` (`src/components/submissions/DropRepoPage.tsx`).

| # | Step | Trigger | Notable extra properties |
| - | ---- | ------- | ------------------------ |
| 1 | `submit_open` | DropRepoPage mount | — |
| 2 | `submit_fill` | First non-empty change to the repo input on the current mount | — |
| 3 | `submit_success` | API responded `ok: true` | `kind` (`created` \| `duplicate` \| `already_tracked`) |

`submit_fill` fires **once per mount** — clearing the form after a
successful "created" submission also resets the latch so a follow-up
submission is captured cleanly. There's no explicit `submit_failure`
event today: validation failures keep the operator on the form, which
the dashboard can spot as `submit_fill` without a downstream
`submit_success`.

### `revenue-claim` - repo to revenue claim form to moderation queue

Lives on `/submit/revenue` (`src/components/submissions/DropRevenuePage.tsx`).

| # | Step | Trigger | Notable extra properties |
| - | ---- | ------- | ------------------------ |
| 1 | `revenue_claim_open` | `DropRevenuePage` mount, including repo-detail handoffs | `repo`, `source` (`repo_detail` \| `submit_revenue_page`), `repo_present` |
| 2 | `revenue_claim_submit_success` | Revenue API responded `ok: true` | `repo`, `source`, `mode` (`trustmrr_link` \| `self_report`), `kind` (`created` \| `duplicate`) |

### `account-auth` - single account CTA to hosted auth and success

The header exposes one anonymous-user account entry, not separate sign-in and
sign-up buttons. Clerk's hosted forms still cross-link between sign-in and
sign-up after the user lands on the auth surface.

| # | Step | Trigger | Notable extra properties |
| - | ---- | ------- | ------------------------ |
| 1 | `account_cta_click` | Header `Account` click | `source` (`header`), `auth_path` (`/sign-in` \| `/sign-up`) |
| 2 | `sign_in_view` | `/sign-in` hosted auth page mount | `redirect_present` |
| 2′ | `sign_up_view` | `/sign-up` hosted auth page mount | `redirect_present` |
| 3 | `sign_in_success` | Clerk `session.created` webhook | `source` (`clerk_webhook`), `session_id` |
| 3′ | `sign_up_success` | Clerk `user.created` webhook | `source` (`clerk_webhook`), `profile_handle`, `referral_present` |

`sign_in_success` requires `session.created` to be enabled on the Clerk webhook
subscription. `sign_up_success` is already covered by the required
`user.created` subscription.

---

## Adding a new flow

1. Add the flow id to the `FunnelFlow` union and any new step ids to
   `FunnelStep` in `src/lib/analytics/funnel.ts`. The TypeScript union
   is the single source of truth — a typo at the call site becomes a
   compile error.
2. Wire `captureFunnelStep`, `<FunnelMount>`, or `<TrackedExternalLink>`
   into the relevant component(s).
3. Document the flow in this file in the same shape (table per flow).
4. Ping whoever maintains the PostHog dashboards so they can build the
   funnel insight in PostHog → Insights → New funnel, filtered on
   `flow=<your-flow-id>`.

## Verifying locally

- Set `NEXT_PUBLIC_POSTHOG_KEY` (or PostHog's documented
  `NEXT_PUBLIC_POSTHOG_TOKEN`) in `.env.local`. With `NODE_ENV=development`
  the client SDK runs in debug mode and logs every capture to the console.
- Set `NEXT_PUBLIC_POSTHOG_HOST` to the same region as the public token
  (`https://us.i.posthog.com` for the current shared project). Host values
  are trimmed at runtime so accidental trailing newlines do not break the SDK.
  The client accepts the repo's existing `NEXT_PUBLIC_POSTHOG_KEY` env name
  and PostHog's documented `NEXT_PUBLIC_POSTHOG_TOKEN` name.
- PostHog "Live events" tab shows the events as they land. Filter on
  `event = funnel_step` to see only the funnel surface; group by
  `properties.flow` to slice per-funnel.
- Headless Playwright/Chromium is bot-filtered by the SDK by default, so
  `capture()` returns no event in those probes. If you need a synthetic
  browser smoke test, override `posthog.config.opt_out_useragent_filter`
  only inside the probe and confirm an event request lands on `/e/` or
  `/i/v0/e/`.
- Funnel charts: PostHog → Insights → New funnel → pick `funnel_step`
  multiple times, fix `flow` to the chosen flow id and `step` to the
  step you want for that position.
