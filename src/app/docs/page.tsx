// /docs — Swagger UI mounted against the live /api/openapi.json.
//
// Why a separate page (not just /api/openapi.json):
//   - openapi.json is the machine-readable surface (JSON-RPC clients,
//     code generators, MCP discovery). Humans need the rendered Swagger UI
//     with interactive Try-It-Out, schema explorer, and per-endpoint docs.
//   - The audit's docs.md fix #1 flagged the absence of a human-readable
//     /docs route as the highest-leverage doc gap. This file mounts Swagger UI
//     via the swagger-ui CDN — zero npm-dependency cost since we lazy-load
//     from unpkg at runtime, and the OpenAPI spec is already live on-domain.
//
// Note on CDN load: the unpkg script is loaded with `defer` so it doesn't
// block the page paint, and we feature-detect `window.SwaggerUIBundle`
// before initialising — failure mode is a graceful "OpenAPI spec link"
// fallback rather than a broken page.

import type { Metadata } from "next";

const SWAGGER_VERSION = "5.17.14";
const SWAGGER_CSS = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const SWAGGER_BUNDLE = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;
const SWAGGER_PRESET = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-standalone-preset.js`;

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "API Reference",
  description:
    "Interactive OpenAPI 3.1 reference for the TrendingRepo REST surface. Browse every endpoint, schema, and example response — with live Try-It-Out against the production pipeline.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "TrendingRepo API Reference",
    description:
      "Interactive OpenAPI 3.1 reference for the TrendingRepo REST API. Browse every endpoint with live Try-It-Out.",
    url: "/docs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrendingRepo API Reference",
    description:
      "Interactive OpenAPI 3.1 reference for the TrendingRepo REST API.",
  },
};

export const dynamic = "force-static";

export default function DocsPage() {
  // Inline init script — runs once SwaggerUIBundle is loaded from the CDN
  // (the script tag is deferred). Pulls the spec from the same-origin
  // /api/openapi.json so cross-origin doesn't require CORS headers.
  const initScript = `
    (function () {
      function tryInit() {
        if (typeof window.SwaggerUIBundle !== "function") {
          return false;
        }
        window.SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 1,
          presets: [
            window.SwaggerUIBundle.presets.apis,
            window.SwaggerUIStandalonePreset && window.SwaggerUIStandalonePreset
          ].filter(Boolean),
          layout: "BaseLayout"
        });
        return true;
      }
      if (!tryInit()) {
        // Poll briefly (defer + cdn load is normally <1s).
        var tries = 0;
        var iv = setInterval(function () {
          if (tryInit() || tries++ > 60) clearInterval(iv);
        }, 50);
      }
    })();
  `;

  return (
    <>
      {/* Swagger UI CSS + JS pulled from unpkg. Pinned version so a
          breaking 5.x release can't silently change the rendered surface. */}
      <link rel="stylesheet" href={SWAGGER_CSS} />
      <script src={SWAGGER_BUNDLE} defer />
      <script src={SWAGGER_PRESET} defer />

      <main
        id="main-content"
        style={{
          padding: "clamp(20px, 4vw, 40px) clamp(16px, 3vw, 32px)",
          background: "var(--v4-bg-000)",
          minHeight: "100vh",
        }}
      >
        <header style={{ maxWidth: "1240px", margin: "0 auto 24px" }}>
          <p
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "11px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--v4-ink-400)",
              marginBottom: "8px",
            }}
          >
            API · OpenAPI 3.1
          </p>
          <h1
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
              color: "var(--v4-ink-100)",
              marginBottom: "12px",
            }}
          >
            TrendingRepo API Reference
          </h1>
          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.55,
              color: "var(--v4-ink-300)",
              maxWidth: "720px",
            }}
          >
            Interactive reference for the public REST surface. The same spec
            powers the MCP server and CLI.{" "}
            <a
              href="/api/openapi.json"
              style={{ color: "var(--v4-acc)", textDecoration: "underline" }}
            >
              Download openapi.json
            </a>{" "}
            ·{" "}
            <a
              href="/portal/docs"
              style={{ color: "var(--v4-acc)", textDecoration: "underline" }}
            >
              MCP Portal
            </a>{" "}
            ·{" "}
            <a
              href="/cli"
              style={{ color: "var(--v4-acc)", textDecoration: "underline" }}
            >
              CLI reference
            </a>
          </p>
        </header>

        <div
          id="swagger-ui"
          style={{
            background: "var(--v4-bg-025, #fff)",
            borderRadius: "8px",
            padding: "8px",
            margin: "0 auto",
            maxWidth: "1240px",
          }}
        />

        {/* Init script runs once SwaggerUIBundle is on window. Inline so
            we don't ship a separate bundle file just for one init call. */}
        <script
          dangerouslySetInnerHTML={{
            __html: initScript,
          }}
        />

        {/* Graceful no-JS fallback */}
        <noscript>
          <div
            style={{
              maxWidth: "720px",
              margin: "32px auto",
              padding: "16px",
              border: "1px solid var(--v4-line-100)",
              color: "var(--v4-ink-300)",
            }}
          >
            <p style={{ marginBottom: "8px" }}>
              The interactive reference requires JavaScript. The OpenAPI spec
              is available directly:
            </p>
            <p>
              <a href="/api/openapi.json" style={{ color: "var(--v4-acc)" }}>
                /api/openapi.json
              </a>
            </p>
          </div>
        </noscript>
      </main>
    </>
  );
}
