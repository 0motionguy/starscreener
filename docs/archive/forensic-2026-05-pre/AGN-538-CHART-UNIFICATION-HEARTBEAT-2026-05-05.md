# AGN-538 Heartbeat Progress - 2026-05-05

## Decision Snapshot
Chosen unified chart library: `lightweight-charts` (TradingView).

Evaluated candidates using live GitHub API metadata (2026-05-05):
- `tradingview/lightweight-charts`: 15,536 stars, pushed 2026-04-30, latest release `v5.2.0` (2026-04-24), Apache-2.0.
- `leeoniya/uPlot`: 10,112 stars, pushed 2026-04-22, latest release `1.6.32` (2025-03-14), MIT.
- `airbnb/visx`: 20,775 stars, pushed 2026-04-14, latest release `v3.12.0` (2024-11-07), MIT.

Notes:
- `visx` is currently blocked by React peer range (`<=18`) in this repo (`react@19.1.0`), so it is not viable without unsafe dependency overrides.
- `lightweight-charts` is React-version-agnostic and aligns with performance goals.

## Concrete Implementation in This Heartbeat
1. Added dependency:
   - `lightweight-charts@^5.2.0` in `package.json`.
2. Migrated `src/components/home/Tr100IndexChart.tsx` from Recharts to Lightweight Charts:
   - Replaced `ResponsiveContainer + AreaChart` with direct `createChart` usage.
   - Added `AreaSeries` with gradient-like top/bottom fill and accent line.
   - Added resize handling via `ResizeObserver`.
   - Added crosshair tooltip with compact value + UTC date label.
   - Preserved empty-state behavior (`Index warming up...`).

## Verification
- `eslint` passed for the migrated file:
  - `npx eslint src/components/home/Tr100IndexChart.tsx`
- Full repo `typecheck` is currently red due to existing unrelated errors outside AGN-538 scope.

## Next Migration Targets (AGN-538)
1. Migrate `/signals` volume chart shell to `lightweight-charts` (high-visibility P0 surface).
2. Replace duplicated row sparkline SVG code in:
   - `src/components/home/LiveTopTable.tsx`
   - `src/components/skills/SkillsTopTable.tsx`
   - `src/components/mcp/LiveMcpTable.tsx`
   with one shared chart primitive.
3. Remove leftover `recharts` usage once all feature parity is complete.
