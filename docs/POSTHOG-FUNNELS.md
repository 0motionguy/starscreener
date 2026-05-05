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

If `NEXT_PUBLIC_POSTHOG_KEY` is unset (preview / local dev without
analytics provisioned), the helper is a silent no-op.

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

- Set `NEXT_PUBLIC_POSTHOG_KEY` in `.env.local`. With
  `NODE_ENV=development` the client SDK runs in debug mode and logs
  every capture to the console.
- PostHog "Live events" tab shows the events as they land. Filter on
  `event = funnel_step` to see only the funnel surface; group by
  `properties.flow` to slice per-funnel.
- Funnel charts: PostHog → Insights → New funnel → pick `funnel_step`
  multiple times, fix `flow` to the chosen flow id and `step` to the
  step you want for that position.
