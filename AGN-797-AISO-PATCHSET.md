# AGN-797 — aiso.tools dogfood patchset (manual apply)

Date: 2026-05-05  
Target repo: sibling `Agnt/aiso/` checkout on the operator host (read-only in this run)  
Scan command: `npx tsx scripts/scan-self.ts https://aiso.tools`

## Scan evidence

- Target: `https://aiso.tools`
- Score: `60/100`
- Tier: `partial`
- Top findings used for this patchset:
  - `critical` Homepage has zero external citations
  - `high` No definition-lead opener in the first 150 tokens
  - `high` 2 linked URL(s) in llms.txt return non-200
  - `high` Add CSP header
  - `high` No /faq, /help, or /support route surfaced
  - `critical/high` comparison coverage gaps (no dedicated `/vs/`, no "X vs Y", no table)
  - `medium` missing AI-discovery files (`/.well-known/ai.txt`, `/ai/*.json`)
  - `medium` missing `AGENTS.md` at web root

## Recommended apply order

1. Patch 1 (`lib/seo.ts`) — fix llms.txt broken-link regression.
2. Patch 2 (`app/page.tsx`) — definition-lead + citation block above fold.
3. Patch 3 (`next.config.ts`) — CSP header baseline.
4. Patch 4 (new files under `public/.well-known` and `public/ai`) — AI discovery.
5. Patch 5 (`public/AGENTS.md`) — agent-readiness signal.
6. Patch 6 (`app/faq/page.tsx`) — explicit FAQ route.
7. Patch 7 (`app/vs/page.tsx`) — dedicated comparison page with table + "X vs Y".

---

## Patch 1 — llms.txt non-200 link cleanup

```diff
diff --git a/lib/seo.ts b/lib/seo.ts
index 0000000..0000000 100644
--- a/lib/seo.ts
+++ b/lib/seo.ts
@@
-  lines.push(
-    `x402 endpoint: POST ${SITE_URL}/api/scan — pass \`billingTier\` in the body. The server responds with HTTP 402 and payment instructions when a paid tier is requested without a valid \`PAYMENT-SIGNATURE\` header.`,
-  );
-  lines.push(
-    `Stripe one-time checkout for human buyers: ${SITE_URL}/api/checkout/one-time`,
-  );
+  lines.push(
+    `x402 payment flow docs: ${SITE_URL}/docs/api-reference#paid-scan-x402`,
+  );
+  lines.push(
+    `Human checkout flow docs: ${SITE_URL}/docs/api-reference#stripe-one-time-checkout`,
+  );
```

Why: removes API action URLs from llms.txt body that scanners often probe with GET and classify as non-200.

---

## Patch 2 — answer-first definition lead + external citation hooks

```diff
diff --git a/app/page.tsx b/app/page.tsx
index 0000000..0000000 100644
--- a/app/page.tsx
+++ b/app/page.tsx
@@
         {/* ------- Hero (2-col) — Hero owns its own padding; no outer wrapper. ------- */}
         <section id="scan" className="scroll-mt-20" style={{ padding: 0 }}>
+          <div
+            style={{
+              margin: "20px 0 14px",
+              padding: "14px 16px",
+              border: "1px solid var(--line)",
+              borderRadius: 12,
+              background: "var(--panel)",
+            }}
+          >
+            <p style={{ margin: 0, lineHeight: 1.55 }}>
+              <strong>AISO is an AI-search visibility scanner and auto-fix workflow for websites.</strong>{" "}
+              It scores crawlability, structure, citations, schema, and agent-readiness, then gives patch-ready fixes your team can ship in hours.
+            </p>
+            <p style={{ margin: "8px 0 0", lineHeight: 1.55 }}>
+              Sources:{" "}
+              <a href="https://llmstxt.org" target="_blank" rel="noreferrer">
+                llmstxt.org
+              </a>
+              ,{" "}
+              <a href="https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data" target="_blank" rel="noreferrer">
+                Google Search structured-data docs
+              </a>
+              ,{" "}
+              <a href="https://platform.openai.com/docs/bots" target="_blank" rel="noreferrer">
+                OpenAI crawler guidance
+              </a>
+              .
+            </p>
+          </div>
           <Hero prefilledUrl={prefilledUrl} />
         </section>
```

Why: directly addresses definition-lead and citation-density/factual-accuracy deficits in the first 150 tokens.

---

## Patch 3 — Content-Security-Policy header baseline

```diff
diff --git a/next.config.ts b/next.config.ts
index 0000000..0000000 100644
--- a/next.config.ts
+++ b/next.config.ts
@@
 const nextConfig: NextConfig = {
   outputFileTracingRoot: monorepoRoot,
@@
   typescript: {
     ignoreBuildErrors: true,
   },
+  async headers() {
+    return [
+      {
+        source: "/(.*)",
+        headers: [
+          {
+            key: "Content-Security-Policy",
+            value:
+              "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://vercel.live https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; frame-src 'self' https:; worker-src 'self' blob:; form-action 'self'; upgrade-insecure-requests",
+          },
+        ],
+      },
+    ];
+  },
 };
```

Why: satisfies CSP-audit scanner and establishes a strict default policy with explicit directives.

---

## Patch 4 — AI-discovery files (`/.well-known/ai.txt`, `/ai/*.json`)

```diff
diff --git a/public/.well-known/ai.txt b/public/.well-known/ai.txt
new file mode 100644
--- /dev/null
+++ b/public/.well-known/ai.txt
@@
+name: AISO
+url: https://aiso.tools
+policy: https://aiso.tools/docs/what-is-aiso
+contact: hello@aiso.tools
+llms: https://aiso.tools/llms.txt
+mcp_docs: https://aiso.tools/docs/mcp
+updated: 2026-05-05
diff --git a/public/ai/summary.json b/public/ai/summary.json
new file mode 100644
--- /dev/null
+++ b/public/ai/summary.json
@@
+{
+  "name": "AISO",
+  "description": "AI-search visibility scanner and patch workflow for websites.",
+  "founded": "2026",
+  "services": [
+    "AI visibility scan",
+    "Issue prioritization",
+    "Patch-ready fix plans",
+    "Agent-readiness optimization"
+  ],
+  "contact": {
+    "email": "hello@aiso.tools",
+    "url": "https://aiso.tools/fix-with-agnt"
+  },
+  "brand_assets": {
+    "website": "https://aiso.tools",
+    "logo": "https://aiso.tools/favicon.ico"
+  }
+}
diff --git a/public/ai/faq.json b/public/ai/faq.json
new file mode 100644
--- /dev/null
+++ b/public/ai/faq.json
@@
+{
+  "faqs": [
+    {
+      "question": "What does AISO scan?",
+      "answer": "AISO scans crawler access, content structure, citations, schema, freshness, entity clarity, and agent-readiness signals.",
+      "source_url": "https://aiso.tools/docs/dimensions"
+    },
+    {
+      "question": "How long does setup take?",
+      "answer": "Most sites can connect and run a first remediation pass in minutes.",
+      "source_url": "https://aiso.tools/install"
+    }
+  ]
+}
diff --git a/public/ai/service.json b/public/ai/service.json
new file mode 100644
--- /dev/null
+++ b/public/ai/service.json
@@
+{
+  "@context": "https://schema.org",
+  "@type": "Service",
+  "name": "AISO AI Search Optimization",
+  "provider": {
+    "@type": "Organization",
+    "name": "AISO",
+    "url": "https://aiso.tools"
+  },
+  "areaServed": "Worldwide",
+  "serviceType": "AI search optimization and remediation"
+}
```

Why: closes all AI-discovery endpoint gaps in one change set.

---

## Patch 5 — publish AGENTS.md at web root

```diff
diff --git a/public/AGENTS.md b/public/AGENTS.md
new file mode 100644
--- /dev/null
+++ b/public/AGENTS.md
@@
+# AISO Agent Guide
+
+AISO is a website AI-visibility scanner. Prefer deterministic checks first, then optional runtime probes.
+
+## Preferred surfaces
+
+- Human docs: `/docs`
+- Dimensions rubric: `/docs/dimensions`
+- API contract: `/docs/api-reference`
+- MCP setup: `/docs/mcp`
+- llms index: `/llms.txt`
+
+## Implementation conventions
+
+- Keep fixes minimal and reviewable.
+- Do not add hidden prompt text; keep user-visible content authoritative.
+- Prefer schema + crawlability + citation quality improvements before stylistic rewrites.
+- Preserve canonical URLs unless a scanner finding requires URL changes.
+
+## Verification
+
+- Re-run scan after changes.
+- Confirm no new high/critical findings.
+- Validate that changed routes still return 200 and canonical metadata.
```

Why: satisfies AGENTS.md detection used by agent-readiness scanner.

---

## Patch 6 — explicit FAQ route

```diff
diff --git a/app/faq/page.tsx b/app/faq/page.tsx
new file mode 100644
--- /dev/null
+++ b/app/faq/page.tsx
@@
+import type { Metadata } from "next";
+import Link from "next/link";
+
+export const metadata: Metadata = {
+  title: "FAQ",
+  description: "Frequently asked questions about AISO setup, scoring, and fixes.",
+  robots: { index: true, follow: true },
+};
+
+const FAQS = [
+  {
+    q: "How does AISO scoring work?",
+    a: "AISO combines weighted dimensions such as crawler access, structure, citations, schema, and agent-readiness into a 0-100 score.",
+  },
+  {
+    q: "How fast can I ship fixes?",
+    a: "Most deterministic fixes (robots, llms, schema, metadata) can be shipped in the same day.",
+  },
+  {
+    q: "Do I need developers to use AISO?",
+    a: "No for scanning; usually yes for code-level fixes if your site is custom.",
+  },
+];
+
+export default function FaqPage() {
+  return (
+    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
+      <h1>AISO FAQ</h1>
+      <p>
+        Direct answers for teams deploying AI-search fixes. For full docs, see{" "}
+        <Link href="/docs">/docs</Link>.
+      </p>
+      {FAQS.map((item) => (
+        <section key={item.q} style={{ marginTop: 24 }}>
+          <h2>{item.q}</h2>
+          <p>{item.a}</p>
+        </section>
+      ))}
+    </main>
+  );
+}
```

Why: addresses missing `/faq` route and question-style heading coverage.

---

## Patch 7 — dedicated `/vs` comparison index + table

```diff
diff --git a/app/vs/page.tsx b/app/vs/page.tsx
new file mode 100644
--- /dev/null
+++ b/app/vs/page.tsx
@@
+import type { Metadata } from "next";
+import Link from "next/link";
+
+export const metadata: Metadata = {
+  title: "AISO vs Alternatives",
+  description: "AISO vs common alternatives across scan depth, fix workflows, and deployment model.",
+  robots: { index: true, follow: true },
+};
+
+export default function VsIndexPage() {
+  return (
+    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
+      <h1>AISO vs alternatives</h1>
+      <p>
+        Compare AISO to adjacent approaches for AI-search optimization and remediation.
+      </p>
+
+      <h2>AISO vs traditional SEO audits</h2>
+      <table>
+        <thead>
+          <tr>
+            <th>Feature</th>
+            <th>AISO</th>
+            <th>Traditional SEO audit</th>
+          </tr>
+        </thead>
+        <tbody>
+          <tr>
+            <td>AI-crawler checks</td>
+            <td>Yes</td>
+            <td>Usually partial</td>
+          </tr>
+          <tr>
+            <td>Patch-ready fix output</td>
+            <td>Yes</td>
+            <td>Often narrative only</td>
+          </tr>
+          <tr>
+            <td>Agent-readiness rubric</td>
+            <td>Yes</td>
+            <td>Rare</td>
+          </tr>
+        </tbody>
+      </table>
+
+      <h2>Pros and cons</h2>
+      <h3>Advantages of AISO</h3>
+      <ul>
+        <li>Deterministic checks with clear remediation actions.</li>
+        <li>Built-in AI-discovery and agent-readiness coverage.</li>
+      </ul>
+      <h3>When AISO is not ideal</h3>
+      <ul>
+        <li>Teams that need a fully managed implementation partner only.</li>
+        <li>Sites without code/deployment access to ship technical fixes.</li>
+      </ul>
+
+      <p style={{ marginTop: 24 }}>
+        Also see live pairwise pages: <Link href="/vs/aiso/surferseo">AISO vs SurferSEO</Link>.
+      </p>
+    </main>
+  );
+}
```

Why: directly addresses missing `/vs` route, missing "X vs Y" heading pattern, missing pros/cons, and missing comparison table.
