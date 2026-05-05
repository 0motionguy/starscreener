# AGN-557 MCP detail route + sidebar path audit (2026-05-05)

Timestamp: 2026-05-05T00:07:03.8293644+08:00

## Scope
- Verify sidebar MCP nav path wiring in `src/components/layout/SidebarContent.tsx`.
- Verify reachable MCP list route and at least one MCP detail route in browser.

## Code verification
- Sidebar MCP nav row points to `/mcp`:
  - `src/components/layout/SidebarContent.tsx` line with `href="/mcp"`.
- Sidebar active-state matcher includes detail paths:
  - `active={pathname === "/mcp" || pathname.startsWith("/mcp/")}`.
- MCP routes exist on disk:
  - `src/app/mcp/page.tsx`
  - `src/app/mcp/[slug]/page.tsx`
  - with corresponding `loading.tsx` + `error.tsx` files.

## Browser verification (production)
Playwright headless run against `https://trendingrepo.com`:

- `GET /mcp` -> HTTP `200`
  - title: `Trending MCP - TrendingRepo — TrendingRepo`
  - extracted detail links:
    - `/mcp/a6d27e72-aa71-4538-b4f9-c577c8327420`
    - `/mcp/f19a01be-86cb-4de5-9871-3981a94f784f`
    - `/mcp/8330b5fd-bcad-46cc-a536-7f6a25834737`
    - `/mcp/0da1e4cd-c829-4cef-84aa-11680cc3d6e0`
    - `/mcp/8e2eb2b1-b3fb-4cc5-b3fb-1fa7cb6177fb`

- `GET /mcp/a6d27e72-aa71-4538-b4f9-c577c8327420` -> HTTP `200`
  - title: `Math-MCP — TrendingRepo — TrendingRepo`
  - `h1`: `Math-MCP`
  - back link to `/mcp` present: `true`

## Freshness check note
- Mandatory run in this heartbeat: `npm run freshness:check` failed with `ECONNRESET`.
- Result: localhost freshness state is not confirmed healthy in this heartbeat.

## Conclusion
For AGN-557 scope, sidebar MCP path wiring and MCP detail route reachability are verified and working.
