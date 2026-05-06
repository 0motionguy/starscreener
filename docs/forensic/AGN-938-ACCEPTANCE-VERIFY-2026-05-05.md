# AGN-938 Acceptance Verification (2026-05-05)

Issue: `AGN-938`  
Scope: `src/app/layout.tsx` must not use Server-Component-incompatible `next/dynamic({ ssr:false })` patterns.

## Route Smoke Check (dev)

- Timestamp: `2026-05-05T14:29:59+08:00`
- Base URL: `http://127.0.0.1:3023` (active local dev server)

Command:

```powershell
$skills=Invoke-WebRequest -Uri 'http://127.0.0.1:3023/skills' -UseBasicParsing -TimeoutSec 20
$gh=Invoke-WebRequest -Uri 'http://127.0.0.1:3023/githubrepo' -UseBasicParsing -TimeoutSec 20
```

Results:

- `/skills` -> `200` (bytes: `11092906`)
- `/githubrepo` -> `200` (bytes: `1049225`)

Acceptance target for AGN-938 (`/skills` and `/githubrepo` return 200 in dev) is satisfied.

## Regression Guard

Command:

```bash
npx tsx --test src/lib/__tests__/layout-server-component.test.ts
```

Result:

- Pass (`2/2`)
- Guards that `src/app/layout.tsx` does not import `next/dynamic` and does not use `dynamic(...ssr:false)`.
