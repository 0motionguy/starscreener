# Cron route conventions

Every route under `src/app/api/cron/**/route.ts` follows the same shape.
See `aiso-drain/route.ts` and `twitter-daily/route.ts` as canonical
references.

## Auth — non-negotiable

First two lines of every handler:

```ts
const deny = authFailureResponse(verifyCronAuth(request));
if (deny) return deny;
```

`verifyCronAuth` is imported from `@/lib/api/auth`. It compares the
`Authorization` header (raw or `Bearer <token>`) against `CRON_SECRET`
via `timingSafeEqual`. Returns `{ kind: "ok" | "unauthorized" |
"not_configured" }`. Do NOT roll your own bearer compare. Do NOT fall
through to `verifyAdminAuth` — separate blast radii (P0 fix).

## Handler size

Route handler body stays small (~20 lines is the target — 50+ is a
smell). Real work belongs in a sibling helper file or in
`apps/trendingrepo-worker/src/`. The route owns auth, body parsing
(via `parseBody` from `@/lib/api/parse-body`), error envelope, and
delegation. Nothing else.

## Data writes

Writes go through `writeDataStore("<slug>", payload)` from
`scripts/_data-store-write.mjs` (collector path) or
`getDataStore().write(...)` from `@/lib/data-store` (request path).
Never construct Redis keys inline — the namespace lives in the
data-store module.

## Error envelope

`{ ok: false, error: string }` with status 500/503/401. `{ ok: true,
... }` on success. Match `aiso-drain` exactly.

## Vercel Cron compatibility

Export both POST and GET when the route is wired to Vercel Cron — it
fires GET. The GET handler typically just delegates: `return POST(request)`.
