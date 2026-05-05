# X-Forwarded-For Trust Contract

## Scope
- `src/lib/api/client-ip.ts`
- All rate-limit and abuse-control paths that call `getClientIp()`

## Contract
- Trust `x-forwarded-for` only when request traffic is known to be edge-terminated by Vercel (`VERCEL=1`), where the platform owns header injection.
- In local development, trust `x-forwarded-for` only for localhost origins (`localhost`, `127.0.0.1`, `*.localhost`) to keep tests/dev flows deterministic.
- In all other environments, do not trust `x-forwarded-for`; fail closed and use `x-real-ip` if present, otherwise `"unknown"`.

## Security Rationale
- Prevents attacker-controlled `x-forwarded-for` spoofing from becoming a reliable rate-limit bypass in non-edge deployments.
- Preserves existing production behavior on Vercel while making trust boundaries explicit and auditable.

## Operational Notes
- If deployment moves off Vercel behind another trusted proxy, extend `canTrustForwardedFor()` with an explicit positive trust signal for that platform.
- Do not add fallback trust based only on header presence.
