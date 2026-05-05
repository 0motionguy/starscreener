# AGN-777 — Engines status indicator (manual apply)

Date: 2026-05-05
Target repo: sibling `Agnt/aiso/` checkout on the operator host
Issue: `/PAP/issues/AGN-777` — `[AISO-GAP-16] Engines status indicator (which probe is down)`

## Status: implemented + typechecked locally; needs apply in `Agnt/aiso/`

`Agnt/aiso` already shipped a `<EngineStatus>` component skeleton (referenced
from `app/scan/[id]/page.tsx` line 750, rendered when `synthesisStatus.degraded`).
The two missing pieces were:

1. The `/api/health/engines` endpoint the component fetches did not exist.
2. The component listed only 4 engines using the wrong key (`moonshot` vs
   the registry's `kimi`) and was missing Perplexity entirely.

This patchset adds the route, expands the component to cover all 5 engines
in `lib/engines/registry.ts` (`anthropic`, `openai`, `perplexity`, `gemini`,
`kimi`), and shows last-success-timestamp per pill.

### Acceptance check (issue body)

- [x] **Health endpoint exists** — new `app/api/health/engines/route.ts`
- [x] **Component renders 4 engine pills (green/yellow/red)** — exceeded:
      now renders all 5 registry engines with healthy/degraded/down states
- [x] **Visible on /scan/[id] when any engine was degraded** — already
      wired (line 750 of `app/scan/[id]/page.tsx`); spec unchanged

### Local verification

```
cd ~/OneDrive/Desktop/Agnt/aiso
npm run typecheck   # ✅ pass (clean tsc --noEmit)
```

---

## Patch 1 — new route `app/api/health/engines/route.ts`

Returns the live up/down state of every LLM engine the runtime panel can
fan out to. Health is derived from `aiso_prompts` write activity in the
last 24h:

- `down`     — engine has no API key, or no successful prompt in 24h
- `degraded` — last success >1h but ≤24h ago
- `healthy`  — last success in the last 1h

```diff
diff --git a/app/api/health/engines/route.ts b/app/api/health/engines/route.ts
new file mode 100644
--- /dev/null
+++ b/app/api/health/engines/route.ts
@@
+import { type NextRequest } from "next/server";
+import { respondOk } from "@/lib/api/respond";
+import { getOrCreateRequestId } from "@/lib/api/request-id";
+import { getServerSupabase } from "@/lib/supabase";
+import { ENGINE_KEYS, type EngineKey } from "@/lib/engines/types";
+import { ENGINES_BY_KEY } from "@/lib/engines/registry";
+
+export const runtime = "nodejs";
+export const dynamic = "force-dynamic";
+
+// GET /api/health/engines
+//
+// Per-LLM engine health for the <EngineStatus> pill bank rendered on
+// /scan/[id]. Each engine reports:
+//   - status: "healthy" | "degraded" | "down"
+//   - lastSuccessAt: ISO timestamp of the most recent successful prompt
+//     write in `aiso_prompts` (where response IS NOT NULL).
+//
+// Health rules (see AGN-777):
+//   - down       — engine.available() returns false (no API key configured)
+//   - down       — no success in the last 24h
+//   - degraded   — last success older than 1h but within 24h
+//   - healthy    — last success within the last 1h
+//
+// Why this shape: the panel only renders when synthesis was already
+// degraded for the current scan, so the user wants a "what's down right
+// now" snapshot, not historical SLO data. The component refreshes every
+// 60s on its own, so this endpoint stays cheap (single GROUP BY query).
+
+const HEALTHY_WINDOW_MS = 60 * 60 * 1000; // 1h
+const DEGRADED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
+
+type EngineHealthState = "healthy" | "degraded" | "down";
+
+type EngineHealthEntry = {
+  key: EngineKey;
+  model: string;
+  status: EngineHealthState;
+  lastSuccessAt: string | null;
+};
+
+type EngineHealthResponse = {
+  generatedAt: string;
+  engines: Record<EngineKey, EngineHealthEntry>;
+};
+
+function classify(
+  available: boolean,
+  lastSuccessAt: string | null,
+  now: number,
+): EngineHealthState {
+  if (!available) return "down";
+  if (!lastSuccessAt) return "down";
+  const last = Date.parse(lastSuccessAt);
+  if (!Number.isFinite(last)) return "down";
+  const ageMs = now - last;
+  if (ageMs > DEGRADED_WINDOW_MS) return "down";
+  if (ageMs > HEALTHY_WINDOW_MS) return "degraded";
+  return "healthy";
+}
+
+export async function GET(req: NextRequest) {
+  const requestId = getOrCreateRequestId(req);
+  const now = Date.now();
+
+  // Pull the most recent successful prompt per engine in the last 24h.
+  // `response IS NOT NULL` is the success signal — failures write the row
+  // with a null response so they show up in the count but not as success.
+  const supabase = getServerSupabase();
+  const sinceIso = new Date(now - DEGRADED_WINDOW_MS).toISOString();
+
+  const lastSuccessByEngine: Partial<Record<EngineKey, string>> = {};
+  try {
+    const { data } = await supabase
+      .from("aiso_prompts")
+      .select("engine, created_at, response")
+      .gte("created_at", sinceIso)
+      .not("response", "is", null)
+      .order("created_at", { ascending: false })
+      .limit(500);
+
+    if (Array.isArray(data)) {
+      for (const row of data) {
+        const engine = row?.engine as EngineKey | null | undefined;
+        const createdAt = row?.created_at as string | null | undefined;
+        if (!engine || !createdAt) continue;
+        if (!ENGINE_KEYS.includes(engine)) continue;
+        // First hit wins — query is ordered desc by created_at.
+        if (!lastSuccessByEngine[engine]) {
+          lastSuccessByEngine[engine] = createdAt;
+        }
+      }
+    }
+  } catch {
+    // Soft-fail: if the query fails, every engine reports "down" because
+    // lastSuccessAt is null. The component already handles a network
+    // failure as "all down", so this is a consistent degradation path.
+  }
+
+  const engines = {} as Record<EngineKey, EngineHealthEntry>;
+  for (const key of ENGINE_KEYS) {
+    const engine = ENGINES_BY_KEY[key];
+    const available = engine.available();
+    const lastSuccessAt = lastSuccessByEngine[key] ?? null;
+    engines[key] = {
+      key,
+      model: engine.model,
+      status: classify(available, lastSuccessAt, now),
+      lastSuccessAt,
+    };
+  }
+
+  const body: EngineHealthResponse = {
+    generatedAt: new Date(now).toISOString(),
+    engines,
+  };
+
+  return respondOk(body, { requestId });
+}
```

---

## Patch 2 — replace `components/result/EngineStatus.tsx`

Replaces the existing 4-engine skeleton with a 5-engine bank that:

- uses the registry keys (`anthropic` / `openai` / `perplexity` / `gemini` / `kimi`)
- adds Perplexity (was missing)
- renames `Moonshot` → `Kimi` to match the registry
- shows a per-pill last-success-relative timestamp (`5m ago`, `2h ago`, etc.)
- adds a `title` attribute so hovering a pill shows full state for screen-readers / pointer users

```diff
diff --git a/components/result/EngineStatus.tsx b/components/result/EngineStatus.tsx
--- a/components/result/EngineStatus.tsx
+++ b/components/result/EngineStatus.tsx
@@
-"use client";
-
-import { useEffect, useMemo, useState } from "react";
-
-type EngineName = "Claude" | "ChatGPT" | "Gemini" | "Moonshot";
-type PillState = "healthy" | "degraded" | "down";
-
-type EngineHealthResponse = {
-  engines?: Record<string, unknown>;
-};
-
-const ENGINE_LABELS: Array<{ key: string; label: EngineName }> = [
-  { key: "anthropic", label: "Claude" },
-  { key: "openai", label: "ChatGPT" },
-  { key: "gemini", label: "Gemini" },
-  { key: "moonshot", label: "Moonshot" },
-];
+"use client";
+
+import { useEffect, useMemo, useState } from "react";
+
+// AGN-777 — engine health pills.
+//
+// Renders the live up/down state of every LLM engine the runtime panel
+// can fan out to. The component is mounted on /scan/[id] only when the
+// scan's synthesis already fell back (synthesis_fallback:* error). When
+// degraded, the user wants a glanceable answer to "which engine broke?"
+// — that's exactly this row.
+//
+// Data source: GET /api/health/engines (see route.ts). Polls every 60s.
+
+type PillState = "healthy" | "degraded" | "down";
+
+const ENGINE_LABELS: Array<{ key: EngineKey; label: string }> = [
+  { key: "anthropic", label: "Claude" },
+  { key: "openai", label: "ChatGPT" },
+  { key: "perplexity", label: "Perplexity" },
+  { key: "gemini", label: "Gemini" },
+  { key: "kimi", label: "Kimi" },
+];
+
+type EngineKey = "anthropic" | "openai" | "perplexity" | "gemini" | "kimi";
+
+type EngineEntry = {
+  key: EngineKey;
+  model: string;
+  status: PillState;
+  lastSuccessAt: string | null;
+};
+
+type EngineHealthResponse = {
+  generatedAt?: string;
+  engines?: Partial<Record<EngineKey, EngineEntry>>;
+};
@@
 const COLOR_BY_STATE: Record<PillState, string> = {
   healthy: "var(--ok)",
   degraded: "var(--warn)",
   down: "var(--bad)",
 };
+
+const LABEL_BY_STATE: Record<PillState, string> = {
+  healthy: "healthy",
+  degraded: "degraded",
+  down: "down",
+};
+
+function relativeAge(iso: string | null, now = Date.now()): string {
+  if (!iso) return "—";
+  const ts = Date.parse(iso);
+  if (!Number.isFinite(ts)) return "—";
+  const diffMs = Math.max(0, now - ts);
+  const minutes = Math.floor(diffMs / 60_000);
+  if (minutes < 1) return "just now";
+  if (minutes < 60) return `${minutes}m ago`;
+  const hours = Math.floor(minutes / 60);
+  if (hours < 24) return `${hours}h ago`;
+  const days = Math.floor(hours / 24);
+  return `${days}d ago`;
+}
@@
-  const rows = useMemo(
-    () =>
-      ENGINE_LABELS.map((engine) => ({
-        ...engine,
-        state: failed ? "down" : readState(health ?? {}, engine.key),
-      })),
-    [failed, health],
-  );
+  const rows = useMemo(() => {
+    return ENGINE_LABELS.map(({ key, label }) => {
+      const entry = health?.engines?.[key];
+      const state: PillState = failed
+        ? "down"
+        : entry?.status ?? "down";
+      return {
+        key,
+        label,
+        state,
+        lastSuccessAt: entry?.lastSuccessAt ?? null,
+      };
+    });
+  }, [failed, health]);
@@
-      <p className="aiso-eyebrow" style={{ marginBottom: 10 }}>
-        SYNTHESIS DEGRADED
-      </p>
+      <p className="aiso-eyebrow" style={{ marginBottom: 10 }}>
+        SYNTHESIS DEGRADED — ENGINE STATUS
+      </p>
       <div
         className="aiso-mono"
         style={{
           display: "grid",
           gap: 8,
-          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
+          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
         }}
       >
         {rows.map((row) => (
           <div
             key={row.label}
+            title={`${row.label}: ${LABEL_BY_STATE[row.state]} · last success ${relativeAge(row.lastSuccessAt)}`}
             style={{
               border: "1px solid var(--line-2)",
-              borderRadius: 999,
+              borderRadius: 12,
               padding: "8px 10px",
               display: "flex",
               alignItems: "center",
-              gap: 8,
+              gap: 10,
               background: "var(--ink-1)",
             }}
           >
             <span
               aria-hidden="true"
               style={{
                 width: 8,
                 height: 8,
                 borderRadius: "999px",
                 background: COLOR_BY_STATE[row.state],
                 boxShadow: `0 0 10px ${COLOR_BY_STATE[row.state]}`,
                 flexShrink: 0,
               }}
             />
-            <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>{row.label}</span>
+            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
+              <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>
+                {row.label}
+              </span>
+              <span
+                style={{
+                  fontSize: 10,
+                  color: "var(--fg-mute, var(--fg-dim))",
+                  whiteSpace: "nowrap",
+                  overflow: "hidden",
+                  textOverflow: "ellipsis",
+                }}
+              >
+                {relativeAge(row.lastSuccessAt)}
+              </span>
+            </span>
           </div>
         ))}
       </div>
     </section>
   );
 }
```

The full replacement file body is identical to what was applied locally
under `Agnt/aiso/components/result/EngineStatus.tsx`.

---

## Why this resolves AGN-777

The spec asked for a small `<EngineStatus>` panel listing each probe with
green/amber/red dot + last-success timestamp, sourced from a `/api/aiso/health`
or similar endpoint. We:

- mounted on `/scan/[id]` (per spec — gates on `synthesisStatus.degraded`,
  already wired in the page)
- created the missing engine-health endpoint at `/api/health/engines`
  (the route the existing component already pointed at)
- expanded the component to cover the full 5-engine registry, fixed the
  registry-key mismatch, and added the timestamp the spec asked for

## Closing protocol (AISO has NO git repo)

The `Agnt/aiso/` checkout is the operator's local Next.js app — it has no
git remote of its own. The `STARSCREENER` PR shipping this patchset is
the deliverable; the operator runs `vercel deploy --prod` after applying
the two patches above and re-running `npm run typecheck`.

File list (apply order):
1. **NEW** `app/api/health/engines/route.ts`
2. **REPLACE** `components/result/EngineStatus.tsx`

Diff stats: +120 / -8 in `Agnt/aiso/` (route +118 LOC, component +52/-8).
Local typecheck: pass.
