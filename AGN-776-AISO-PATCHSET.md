# AGN-776 — AISO onboarding empty state (manual apply)

Date: 2026-05-05
Target repo: sibling `Agnt/aiso/` checkout on the operator host (read-only in this run)
Issue: `/PAP/issues/AGN-776` — `[AISO-GAP-15] Onboarding empty state (when dashboard enabled)`

## Status: AC already met in `app/dashboard/page.tsx`

The dashboard route already renders an `OnboardingEmptyState` component when:

- The dashboard feature flag is on (`dashboardEnabled()` returns true), AND
- No `subscription_id` query param is present (i.e., the user has no scans yet).

Source of truth: `app/dashboard/page.tsx` lines 30-67 (gate + render) and 172-219 (component body).

### Acceptance check

- [x] **Empty state component** — `OnboardingEmptyState` defined in `app/dashboard/page.tsx` (lines 172-219)
- [x] **Linked from /dashboard when no scans exist** — rendered when `!subscription_id` after the dashboard-enabled gate (line 66)
- [x] **CTA-driven (don't just show "no data")** — primary CTA "Run your first scan →" → `/#scan` (line 210), secondary CTA dynamic sample link via `getDirectoryEntries(1)` (lines 55-65, 213-215)

The implementation also covers the spec's "Design empty state" notes:

- One-line value prop: "Your AI team dashboard comes alive after your first scan." + "Run one scan, then connect your stack and we'll route you into a live Control Center."
- CTA "Run your first scan" → `/#scan` (the current marketing-page anchor; spec said `/`, equivalent — the scan widget lives on the homepage).
- Sample scan link uses a real popular domain pulled via `getDirectoryEntries(1)`, falling back to `/#scan` if the directory read fails.

## Recommended follow-up patch (optional polish)

The empty-state markup currently lives inline in `app/dashboard/page.tsx`. For testability and reuse (e.g., if a future ticket wants to render it from `/dashboard/welcome` or a Storybook story), extract it to its own component file. This is a pure refactor — no UX change.

### Patch 1 — extract OnboardingEmptyState to its own file

```diff
diff --git a/components/dashboard/OnboardingEmptyState.tsx b/components/dashboard/OnboardingEmptyState.tsx
new file mode 100644
--- /dev/null
+++ b/components/dashboard/OnboardingEmptyState.tsx
@@
+import Link from "next/link";
+
+/**
+ * First-time-visitor empty state for `/dashboard`.
+ *
+ * Rendered when the dashboard feature flag is on but the visitor has no
+ * subscription yet (i.e., no scans → nothing to track). Stays CTA-driven:
+ * primary action runs a scan; secondary opens a real sample report so the
+ * visitor immediately sees the format.
+ *
+ * The sample link is pre-resolved on the server (popular domain from the
+ * directory) and passed in as props — keeps this component synchronous,
+ * easy to test, and trivial to reuse from a story or marketing page.
+ */
+export function OnboardingEmptyState({
+  sampleHref,
+  sampleLabel,
+}: {
+  sampleHref: string;
+  sampleLabel: string;
+}) {
+  return (
+    <main
+      data-mode="day"
+      className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center"
+      style={{
+        fontFamily: "var(--font-sans)",
+        background: "var(--paper)",
+        color: "var(--ink)",
+      }}
+    >
+      <span
+        className="mono uppercase"
+        style={{
+          fontSize: 10,
+          letterSpacing: "0.16em",
+          color: "var(--orange)",
+          fontWeight: 700,
+        }}
+      >
+        Dashboard Enabled
+      </span>
+      <h1
+        className="mt-3 text-3xl tracking-tight"
+        style={{
+          fontFamily: "var(--font-sans)",
+          fontWeight: 800,
+          letterSpacing: "-0.04em",
+        }}
+      >
+        Your AI team dashboard comes alive after your first scan.
+      </h1>
+      <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
+        Run one scan, then connect your stack and we&apos;ll route you into a
+        live Control Center.
+      </p>
+      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
+        <Link
+          href="/#scan"
+          className="aiso-btn aiso-btn-primary"
+          style={{ fontSize: 13 }}
+        >
+          Run your first scan →
+        </Link>
+        <Link
+          href={sampleHref}
+          className="aiso-btn aiso-btn-ghost"
+          style={{ fontSize: 13 }}
+        >
+          {sampleLabel} →
+        </Link>
+      </div>
+    </main>
+  );
+}
```

### Patch 2 — switch the page to import the extracted component

```diff
diff --git a/app/dashboard/page.tsx b/app/dashboard/page.tsx
index 0000000..0000000 100644
--- a/app/dashboard/page.tsx
+++ b/app/dashboard/page.tsx
@@
 import { ControlCenter } from "@/components/dashboard/control-center/ControlCenter";
 import { PostHogIdentifyOnSubscription } from "@/components/PostHogIdentifyOnSubscription";
+import { OnboardingEmptyState } from "@/components/dashboard/OnboardingEmptyState";
 import { dashboardEnabled } from "@/lib/result/dashboard-surfaces";
@@
-function OnboardingEmptyState({
-  sampleHref,
-  sampleLabel,
-}: {
-  sampleHref: string;
-  sampleLabel: string;
-}) {
-  return (
-    <main
-      data-mode="day"
-      className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center"
-      style={{
-        fontFamily: "var(--font-sans)",
-        background: "var(--paper)",
-        color: "var(--ink)",
-      }}
-    >
-      <span
-        className="mono uppercase"
-        style={{
-          fontSize: 10,
-          letterSpacing: "0.16em",
-          color: "var(--orange)",
-          fontWeight: 700,
-        }}
-      >
-        Dashboard Enabled
-      </span>
-      <h1
-        className="mt-3 text-3xl tracking-tight"
-        style={{ fontFamily: "var(--font-sans)", fontWeight: 800, letterSpacing: "-0.04em" }}
-      >
-        Your AI team dashboard comes alive after your first scan.
-      </h1>
-      <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
-        Run one scan, then connect your stack and we&apos;ll route you into a live Control Center.
-      </p>
-      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
-        <Link href="/#scan" className="aiso-btn aiso-btn-primary" style={{ fontSize: 13 }}>
-          Run your first scan →
-        </Link>
-        <Link href={sampleHref} className="aiso-btn aiso-btn-ghost" style={{ fontSize: 13 }}>
-          {sampleLabel} →
-        </Link>
-      </div>
-    </main>
-  );
-}
```

Why: the empty-state surface is now a named component that QA, screenshot tests, and a future Storybook page can pull in directly. No UX change; AC stays satisfied.

## Verify

```sh
cd C:\Users\mirko\OneDrive\Desktop\Agnt\aiso
npm run typecheck
npm test -- tests/components/dashboard
```

Then visit `/dashboard` (with `NEXT_PUBLIC_DASHBOARD_ENABLED=1` and no `subscription_id`) and confirm:

- Eyebrow "Dashboard Enabled" renders.
- Headline + sub copy render exactly as above.
- Primary CTA links to `/#scan`.
- Secondary CTA links to a real `/scan/{id}` from the directory (or `/#scan` fallback).
