# RUNBOOK - Internal agent token rotation

Scope: `INTERNAL_AGENT_TOKENS_JSON` used by `verifyInternalAgentAuth` for internal agent access to `/api/internal/*`.

## Token format

Env var accepts either shape:

```json
{ "agent-name": "token-value" }
```

```json
{ "agent-name": ["new-token", "old-token"] }
```

Use the array form for zero-downtime rotation windows.

## Rotation cadence

- Minimum cadence: every 90 days.
- Immediate rotation required on leak suspicion, unauthorized usage, or offboarding.

## Generation

1. Generate a new token (32+ bytes random).
   - PowerShell example:
     ```powershell
     [Convert]::ToBase64String((1..48 | ForEach-Object {Get-Random -Maximum 256}))
     ```
2. Keep token labels in operator notes (never commit raw token values).
3. Update `INTERNAL_AGENT_TOKENS_JSON` by adding the new token first, preserving the old token during overlap:
   ```json
   { "paperclip-sec": ["new-token-v2", "old-token-v1"] }
   ```

## Distribution

Update all token consumers before revoking old values:

- Paperclip/agent runtime that calls internal routes.
- AGNT or worker jobs calling `/api/internal/*`.
- Any CI workflow secret using internal agent auth.

Required rule: all consumers must switch to the new token during overlap window.

## Revocation

1. After all consumers are confirmed on the new token, remove old token from the array:
   ```json
   { "paperclip-sec": ["new-token-v2"] }
   ```
2. Deploy/apply env change.
3. Verify old token now gets `401 unauthorized`.
4. If compromise is suspected, skip overlap and revoke old token immediately.

## Verification checklist per rotation

1. New token accepted (`200` on internal endpoint).
2. Old token accepted only during overlap window.
3. After revocation: old token denied (`401`), new token still accepted (`200`).
4. Record timestamp, operator, principal, and masked token identifiers (first4+last4 only).

## One drill performed (AGN-735)

Code-level drill executed in `src/lib/api/__tests__/auth.test.ts`:

- overlap accepts both: `drill-new-v2` and `drill-old-v1`
- post-revocation denies old and keeps new valid

Command:

```powershell
npx tsx --test src/lib/api/__tests__/auth.test.ts
```

Evidence criteria for this drill:

- test `verifyInternalAgentAuth: rotation drill accepts overlap then revokes old token` passes.
- proves end-to-end parser behavior for overlap and revocation path.
