// /docs/api — TrendingRepo public API reference.
//
// Hand-rendered OpenAPI viewer. The previous `/docs` route 307-redirects to
// the static `public/reference.html` Redoc page; that surface is still the
// canonical "give me the raw spec" experience for tooling. This page is a
// curated, in-app reference that surfaces the API as a visible product
// surface — copy-paste curl per endpoint, plain-English auth + rate-limit
// notes, and a section on the outbound webhook surface (which the OpenAPI
// spec does not describe, because it isn't a REST API — see WEBHOOKS
// section below).
//
// Strategic context: per the 2026-06-15 deep-crawl deltas, none of
// TrendingRepo's competitors expose an API, RSS, or webhook surface. The
// spec is already live at /api/openapi.json but invisible — this page
// makes the moat discoverable.
//
// Composition / styling rules:
//   - Server component. No state, no client JS.
//   - Loads the spec via `getApiCatalog()` (in-process readFileSync). The
//     same disk read backs `/api/openapi.json` already, so no new
//     dependency or HTTP fetch is introduced.
//   - Matches the terminal-corpus aesthetic: PageHead + SectionHead +
//     Card; mono font for code blocks; --v4-money for the accent stripe.
//   - Zero third-party docs deps. No Swagger UI / Redoc here — those add
//     ~60 KB to the bundle and we already have Redoc at /docs for the
//     full spec-viewer use case.
//   - ISR with a 600 s revalidate. The spec changes per-deploy at most.

import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FooterBar, FooterLink } from "@/components/ui/FooterBar";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { absoluteUrl } from "@/lib/seo";

import { buildCurlExample, buildResponseHint, methodTone } from "./examples";
import {
  getApiCatalog,
  type ApiEndpoint,
  type OpenApiParameter,
} from "./spec";

// The spec lives in `docs/openapi.json` on disk. ISR is the right cadence
// here — the file only changes per-deploy, so 10 minutes is plenty.
export const runtime = "nodejs";
export const revalidate = 600;

const PAGE_TITLE = "API — TrendingRepo";
const PAGE_DESCRIPTION =
  "Public REST API for TrendingRepo: canonical per-repo profile, mentions, freshness, AISO scans, alerts, webhooks, SSE stream. Copy-paste curl examples and full auth notes.";

export function generateMetadata(): Metadata {
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: { canonical: absoluteUrl("/docs/api") },
    openGraph: {
      type: "website",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: absoluteUrl("/docs/api"),
    },
    keywords: [
      "TrendingRepo API",
      "GitHub trending API",
      "OpenAPI 3.1",
      "webhook integration",
      "Slack notifications",
      "Server-Sent Events",
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METHOD_LABEL: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};

function tagSlug(tag: string): string {
  return `tag-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function paramTypeLabel(param: OpenApiParameter): string {
  const schema = param.schema;
  if (!schema) return "string";
  if (schema.$ref) return schema.$ref.replace(/^#\/components\/schemas\//, "");
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum.map(String).join(" | ");
  }
  return schema.type ?? "string";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsApiPage() {
  const catalog = getApiCatalog();

  // Defensive — total should be non-zero if the spec loaded; surface the
  // failure shape so a regression in the loader is visible in prod.
  if (catalog.totalEndpoints === 0) {
    return (
      <main className="home-surface">
        <PageHead
          crumb={
            <>
              <b>API</b> · DOCS · /DOCS/API
            </>
          }
          h1="API reference."
          lede="The OpenAPI spec failed to load. The raw spec is still available at /api/openapi.json."
        />
      </main>
    );
  }

  return (
    <main className="home-surface" style={{ paddingBottom: 48 }}>
      <PageHead
        crumb={
          <>
            <b>API</b> · DOCS · /DOCS/API
          </>
        }
        h1="The TrendingRepo API."
        lede={
          <>
            Every signal the site renders is also a JSON endpoint. Canonical
            per-repo profile, mentions feed, freshness, AISO scans, alerts,
            ideas, compare bundles, an SSE stream for live rank changes, and
            an outbound webhook surface for Slack and Discord — all rooted at
            the same base.
          </>
        }
        clock={
          <>
            <span className="big">{catalog.totalEndpoints}</span>
            <span className="muted">ENDPOINTS · v{catalog.version}</span>
          </>
        }
      />

      {/* ───── TL;DR ───────────────────────────────────────────────────── */}
      <SectionHead
        num="// 01"
        title="TL;DR"
        meta={
          <>
            base · <b>https://trendingrepo.com</b>
          </>
        }
      />
      <div className="grid">
        <div className="col-6">
          <Card variant="panel">
            <CardHeader>AUTH</CardHeader>
            <CardBody>
              <ul style={tldrListStyle}>
                <li>
                  <b style={tldrKeyStyle}>Public reads</b> — every{" "}
                  <code style={codeStyle}>/api/repos/*</code>,{" "}
                  <code style={codeStyle}>/api/search</code>,{" "}
                  <code style={codeStyle}>/api/categories</code>,{" "}
                  <code style={codeStyle}>/api/compare</code>,{" "}
                  <code style={codeStyle}>/api/skills</code>,{" "}
                  <code style={codeStyle}>/api/mcp/trending</code>: no auth.
                </li>
                <li>
                  <b style={tldrKeyStyle}>Per-user writes</b> — alerts, rules,
                  ideas, reactions: <code style={codeStyle}>Bearer USER_TOKEN</code>{" "}
                  or the <code style={codeStyle}>ss_user</code> session cookie
                  from <code style={codeStyle}>POST /api/auth/session</code>.
                </li>
                <li>
                  <b style={tldrKeyStyle}>Operator surface</b> — pipeline /
                  cron / admin: <code style={codeStyle}>Bearer CRON_SECRET</code>{" "}
                  or <code style={codeStyle}>Bearer ADMIN_TOKEN</code>. Not
                  intended for third-party use.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
        <div className="col-6">
          <Card variant="panel">
            <CardHeader>RATE LIMITS &amp; CACHING</CardHeader>
            <CardBody>
              <ul style={tldrListStyle}>
                <li>
                  <b style={tldrKeyStyle}>Public reads are CDN-cached</b> with{" "}
                  <code style={codeStyle}>s-maxage=30 .. 3600</code> +{" "}
                  <code style={codeStyle}>stale-while-revalidate</code>. Hit
                  them as often as you want; the origin sees one request per
                  cache window per region.
                </li>
                <li>
                  <b style={tldrKeyStyle}>No bucketed rate limit on the public
                  surface today.</b> Per-endpoint cost guards exist on the
                  expensive paths (Twitter, Tavily) and return{" "}
                  <code style={codeStyle}>429</code> with{" "}
                  <code style={codeStyle}>Retry-After</code> when tripped.
                </li>
                <li>
                  <b style={tldrKeyStyle}>SSE stream</b>{" "}
                  (<code style={codeStyle}>/api/stream</code>) has a subscriber
                  cap — over the cap returns{" "}
                  <code style={codeStyle}>503</code>; back off and retry.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ───── Servers ────────────────────────────────────────────────── */}
      <SectionHead
        num="// 02"
        title="Base URLs"
        meta={
          <>
            <b>{catalog.servers.length}</b> servers · prod first
          </>
        }
      />
      <Card variant="panel">
        <CardBody style={{ padding: "10px 14px" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Environment</Th>
                <Th>Base URL</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {catalog.servers.map((server) => (
                <tr key={server.url}>
                  <Td>{server.description?.split("(")[0]?.trim() ?? "—"}</Td>
                  <Td>
                    <code style={codeStyle}>{server.url}</code>
                  </Td>
                  <Td>{server.description ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* ───── Security schemes ───────────────────────────────────────── */}
      <SectionHead
        num="// 03"
        title="Authentication"
        meta={
          <>
            <b>{catalog.securitySchemes.length}</b> schemes
          </>
        }
      />
      <div className="grid">
        {catalog.securitySchemes.map((scheme) => (
          <div className="col-6" key={scheme.id}>
            <Card variant="panel">
              <CardHeader right={<code style={codeStyleAccent}>{scheme.id}</code>}>
                {scheme.type === "http"
                  ? `HTTP ${scheme.scheme?.toUpperCase() ?? "BEARER"}`
                  : scheme.type.toUpperCase()}
              </CardHeader>
              <CardBody>
                <p style={paragraphStyle}>{scheme.description}</p>
              </CardBody>
            </Card>
          </div>
        ))}
      </div>

      {/* ───── Endpoint index ─────────────────────────────────────────── */}
      <SectionHead
        num="// 04"
        title="Endpoints"
        meta={
          <>
            <b>{catalog.totalEndpoints}</b> ops · <b>{catalog.sections.length}</b>{" "}
            tags
          </>
        }
      />
      <Card variant="panel">
        <CardBody style={{ padding: "10px 14px" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Tag</Th>
                <Th>Method</Th>
                <Th>Path</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {catalog.sections.flatMap((section) =>
                section.endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method}-${endpoint.path}`}>
                    <Td>
                      <a href={`#${tagSlug(section.tag)}`} style={linkStyle}>
                        {section.tag}
                      </a>
                    </Td>
                    <Td>
                      <Badge tone={methodTone(endpoint.method)} size="xs">
                        {METHOD_LABEL[endpoint.method] ?? endpoint.method.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>
                      <a href={`#${endpoint.anchor}`} style={pathLinkStyle}>
                        {endpoint.path}
                      </a>
                    </Td>
                    <Td>{endpoint.summary}</Td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* ───── Per-tag sections ───────────────────────────────────────── */}
      {catalog.sections.map((section, idx) => (
        <section key={section.tag} id={tagSlug(section.tag)}>
          <SectionHead
            num={`// ${String(idx + 5).padStart(2, "0")}`}
            title={section.tag}
            meta={
              <>
                <b>{section.endpoints.length}</b> endpoints
              </>
            }
          />
          {section.description ? (
            <p style={tagDescStyle}>{section.description}</p>
          ) : null}
          <div style={endpointStackStyle}>
            {section.endpoints.map((endpoint) => (
              <EndpointCard endpoint={endpoint} key={endpoint.anchor} />
            ))}
          </div>
        </section>
      ))}

      {/* ───── Webhooks ───────────────────────────────────────────────── */}
      <SectionHead
        num={`// ${String(catalog.sections.length + 5).padStart(2, "0")}`}
        title="Webhooks (Slack & Discord)"
        meta={<>outbound · operator-configured</>}
      />
      <div className="grid">
        <div className="col-8">
          <Card variant="panel">
            <CardHeader>OUTBOUND WEBHOOK SURFACE</CardHeader>
            <CardBody>
              <p style={paragraphStyle}>
                TrendingRepo can push events to Slack and Discord webhooks
                whenever a tracked signal crosses a threshold. Three event
                families ship today, each with a payload formatter per
                provider:
              </p>
              <ul style={tldrListStyle}>
                <li>
                  <b style={tldrKeyStyle}>breakout</b> — a tracked repo
                  switched into a breakout state. Payload includes{" "}
                  <code style={codeStyle}>fullName</code>,{" "}
                  <code style={codeStyle}>momentumScore</code>,{" "}
                  <code style={codeStyle}>stars</code>,{" "}
                  <code style={codeStyle}>starsDelta24h</code>,{" "}
                  <code style={codeStyle}>starsDelta7d</code>,{" "}
                  <code style={codeStyle}>movementStatus</code>.
                </li>
                <li>
                  <b style={tldrKeyStyle}>funding</b> — a funding signal
                  matched a tracked company. Payload includes{" "}
                  <code style={codeStyle}>headline</code>,{" "}
                  <code style={codeStyle}>sourceUrl</code>,{" "}
                  <code style={codeStyle}>amountDisplay</code>,{" "}
                  <code style={codeStyle}>amountUsd</code>,{" "}
                  <code style={codeStyle}>roundType</code>.
                </li>
                <li>
                  <b style={tldrKeyStyle}>revenue</b> — a self-reported MRR
                  overlay was added or updated (formatter is phase-2; the
                  enqueue path is live).
                </li>
              </ul>
              <p style={paragraphStyle}>
                Per-target filters narrow what fires: minimum momentum
                score, minimum funding amount, and language allow-list.
                Deliveries are dedup-keyed by{" "}
                <code style={codeStyle}>
                  {`${"$"}{event}:${"$"}{subjectId}:${"$"}{targetId}`}
                </code>{" "}
                so re-enqueueing the same logical event is a no-op until the
                next signal change.
              </p>
              <p style={paragraphStyle}>
                Failed deliveries retry with exponential backoff and land in
                a dead-letter queue. A daily digest cron emails the operator
                the dead-letter summary at{" "}
                <code style={codeStyle}>
                  /api/cron/webhooks/dead-letter-digest
                </code>
                .
              </p>
            </CardBody>
          </Card>
        </div>
        <div className="col-4">
          <Card variant="panel">
            <CardHeader>CONFIG</CardHeader>
            <CardBody>
              <p style={paragraphStyle}>
                Webhook targets are operator-configured (not exposed via
                self-serve REST today). To add a target, drop a row into{" "}
                <code style={codeStyle}>data/webhook-targets.json</code>:
              </p>
              <pre style={preStyle}>{WEBHOOK_TARGET_EXAMPLE}</pre>
              <p style={{ ...paragraphStyle, marginTop: 10 }}>
                A self-serve <code style={codeStyle}>/api/webhooks/targets</code>{" "}
                surface is on the roadmap; subscribe to the changelog for the
                ship date.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ───── Slack ─────────────────────────────────────────────────── */}
      <SectionHead
        num={`// ${String(catalog.sections.length + 6).padStart(2, "0")}`}
        title="Slack integration"
        meta={<>provider · slack incoming webhook</>}
      />
      <Card variant="panel">
        <CardBody>
          <p style={paragraphStyle}>
            The Slack provider formats every event family as a Block Kit
            payload that renders cleanly in any channel. Breakout cards
            include the repo name, language chip, star delta, momentum
            score, and a direct link to{" "}
            <code style={codeStyle}>
              {`https://trendingrepo.com/repo/${"$"}{owner}/${"$"}{name}`}
            </code>
            . Funding cards highlight the round type and amount.
          </p>
          <p style={paragraphStyle}>
            To wire it up: create an incoming webhook in your Slack workspace
            (Apps → Incoming WebHooks → Add to Slack), then add a target row
            with{" "}
            <code style={codeStyle}>{`"provider": "slack"`}</code> and the
            webhook URL. The drain cron posts at most once per signal-target
            pair per signal change. Discord works identically with{" "}
            <code style={codeStyle}>{`"provider": "discord"`}</code>.
          </p>
        </CardBody>
      </Card>

      {/* ───── Errors ────────────────────────────────────────────────── */}
      <SectionHead
        num={`// ${String(catalog.sections.length + 7).padStart(2, "0")}`}
        title="Error envelope"
        meta={<>uniform · across every endpoint</>}
      />
      <Card variant="panel">
        <CardBody>
          <p style={paragraphStyle}>
            Every endpoint returns a uniform error shape on a non-2xx
            status. The HTTP code identifies the class of failure; the body
            adds machine-readable detail.
          </p>
          <pre style={preStyle}>{ERROR_ENVELOPE_EXAMPLE}</pre>
          <table style={{ ...tableStyle, marginTop: 14 }}>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>
                  <code style={codeStyle}>400</code>
                </Td>
                <Td>Invalid parameter, body shape, or slug.</Td>
              </tr>
              <tr>
                <Td>
                  <code style={codeStyle}>401</code>
                </Td>
                <Td>Missing or invalid credentials.</Td>
              </tr>
              <tr>
                <Td>
                  <code style={codeStyle}>404</code>
                </Td>
                <Td>Resource not found (unknown repo, expired cursor).</Td>
              </tr>
              <tr>
                <Td>
                  <code style={codeStyle}>429</code>
                </Td>
                <Td>
                  Cost-guard tripped on an expensive read. Honour the{" "}
                  <code style={codeStyle}>Retry-After</code> header.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code style={codeStyle}>503</code>
                </Td>
                <Td>
                  SSE subscriber cap hit, or{" "}
                  <code style={codeStyle}>SESSION_SECRET</code> not configured
                  in prod.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code style={codeStyle}>500</code>
                </Td>
                <Td>Internal error. Stack trace stays in the server log.</Td>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      <FooterBar
        meta={
          <>
            spec · <code style={codeStyle}>v{catalog.version}</code>
            {" · "}
            generated from{" "}
            <code style={codeStyle}>docs/openapi.json</code>
          </>
        }
        actions={
          <>
            <FooterLink href="/api/openapi.json">RAW SPEC →</FooterLink>
            <span style={{ marginLeft: 12 }} />
            <FooterLink href="/docs">REDOC →</FooterLink>
            <span style={{ marginLeft: 12 }} />
            <Link href="/cli" className="ds-footer-link">
              CLI →
            </Link>
          </>
        }
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// EndpointCard — per-operation expandable block
// ---------------------------------------------------------------------------

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  const curl = buildCurlExample(endpoint);
  const responseHint = buildResponseHint(endpoint);
  const pathParams = endpoint.parameters.filter((p) => p.in === "path");
  const queryParams = endpoint.parameters.filter((p) => p.in === "query");
  const headerParams = endpoint.parameters.filter((p) => p.in === "header");

  return (
    <Card variant="panel">
      <CardHeader
        right={
          endpoint.security.length > 0 ? (
            <span style={authBadgeStyle}>
              AUTH · {endpoint.security.map((s) => s.toUpperCase()).join(" | ")}
            </span>
          ) : (
            <span style={publicBadgeStyle}>PUBLIC</span>
          )
        }
      >
        <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
          <Badge tone={methodTone(endpoint.method)} size="sm">
            {METHOD_LABEL[endpoint.method] ?? endpoint.method.toUpperCase()}
          </Badge>
          <code id={endpoint.anchor} style={pathHeaderStyle}>
            {endpoint.path}
          </code>
        </span>
      </CardHeader>
      <CardBody style={{ padding: "12px 14px 14px" }}>
        <p style={endpointSummaryStyle}>{endpoint.summary}</p>
        {endpoint.description ? (
          <p style={endpointDescriptionStyle}>{endpoint.description}</p>
        ) : null}

        {pathParams.length > 0 ? (
          <ParameterTable label="Path parameters" params={pathParams} />
        ) : null}
        {queryParams.length > 0 ? (
          <ParameterTable label="Query parameters" params={queryParams} />
        ) : null}
        {headerParams.length > 0 ? (
          <ParameterTable label="Header parameters" params={headerParams} />
        ) : null}

        <h4 style={subheadStyle}>Example request</h4>
        <pre style={preStyle}>{curl}</pre>

        <h4 style={subheadStyle}>Response</h4>
        <pre style={preStyle}>{responseHint}</pre>

        <h4 style={subheadStyle}>Status codes</h4>
        <ul style={statusListStyle}>
          {endpoint.responses.map((response) => (
            <li key={response.status} style={statusListItemStyle}>
              <code style={statusCodeStyle}>{response.status}</code>{" "}
              <span>{response.description || "no description"}</span>
              {response.schemaSummary ? (
                <span style={schemaHintStyle}>· {response.schemaSummary}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function ParameterTable({
  label,
  params,
}: {
  label: string;
  params: OpenApiParameter[];
}) {
  return (
    <>
      <h4 style={subheadStyle}>{label}</h4>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Required</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={`${param.in}-${param.name}`}>
              <Td>
                <code style={codeStyleAccent}>{param.name}</code>
              </Td>
              <Td>
                <code style={codeStyle}>{paramTypeLabel(param)}</code>
              </Td>
              <Td>
                {param.required ? (
                  <span style={{ color: "var(--v4-money, #fbbf24)" }}>yes</span>
                ) : (
                  <span style={{ color: "var(--v4-ink-400)" }}>—</span>
                )}
              </Td>
              <Td>{param.description ?? param.schema?.description ?? ""}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Table cell wrappers — terse <th> / <td> with consistent V4 tokens.
// ---------------------------------------------------------------------------

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Style constants — inline so the page is self-contained (no new CSS file).
// All values reference --v4-* tokens.
// ---------------------------------------------------------------------------

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 12,
  color: "var(--v4-ink-100)",
  background: "var(--v4-bg-050, rgba(255,255,255,0.04))",
  padding: "1px 5px",
  borderRadius: 2,
  border: "1px solid var(--v4-line-100, rgba(255,255,255,0.06))",
};

const codeStyleAccent: React.CSSProperties = {
  ...codeStyle,
  color: "var(--v4-acc)",
};

const preStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--v4-ink-100)",
  background: "var(--v4-bg-050, #0f0f0f)",
  border: "1px solid var(--v4-line-100, rgba(255,255,255,0.06))",
  padding: 12,
  margin: "8px 0 0",
  overflowX: "auto",
  whiteSpace: "pre",
  borderRadius: 2,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  marginTop: 4,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--v4-ink-300)",
  borderBottom: "1px solid var(--v4-line-100, rgba(255,255,255,0.08))",
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  color: "var(--v4-ink-200)",
  borderBottom: "1px solid var(--v4-line-100, rgba(255,255,255,0.04))",
  verticalAlign: "top",
  lineHeight: 1.5,
};

const subheadStyle: React.CSSProperties = {
  margin: "16px 0 6px",
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--v4-ink-300)",
  fontWeight: 500,
};

const paragraphStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "var(--v4-ink-200)",
  fontSize: 13,
  lineHeight: 1.6,
};

const tldrListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "var(--v4-ink-200)",
  fontSize: 13,
  lineHeight: 1.6,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const tldrKeyStyle: React.CSSProperties = {
  color: "var(--v4-ink-100)",
  fontWeight: 600,
};

const tagDescStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "var(--v4-ink-300)",
  fontSize: 12,
  lineHeight: 1.55,
  maxWidth: 720,
};

const endpointStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginBottom: 24,
};

const endpointSummaryStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "var(--v4-ink-100)",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 500,
};

const endpointDescriptionStyle: React.CSSProperties = {
  margin: "0 0 4px",
  color: "var(--v4-ink-200)",
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const pathHeaderStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 13,
  color: "var(--v4-ink-100)",
  letterSpacing: "0.02em",
};

const pathLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  color: "var(--v4-ink-100)",
  textDecoration: "none",
  fontSize: 12,
};

const linkStyle: React.CSSProperties = {
  color: "var(--v4-acc)",
  textDecoration: "none",
  fontSize: 11,
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const authBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "var(--v4-money, #fbbf24)",
};

const publicBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "var(--v4-acc)",
};

const statusListStyle: React.CSSProperties = {
  margin: "4px 0 0",
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const statusListItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  fontSize: 12,
  color: "var(--v4-ink-200)",
  lineHeight: 1.5,
};

const statusCodeStyle: React.CSSProperties = {
  ...codeStyle,
  minWidth: 32,
  textAlign: "center",
  display: "inline-block",
};

const schemaHintStyle: React.CSSProperties = {
  color: "var(--v4-ink-400)",
  fontSize: 11,
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
};

// ---------------------------------------------------------------------------
// Hand-authored examples for the webhook + error sections
// ---------------------------------------------------------------------------

const WEBHOOK_TARGET_EXAMPLE = `[
  {
    "id": "team-eng-slack",
    "provider": "slack",
    "url": "https://hooks.slack.com/services/T0.../B0.../...",
    "events": ["breakout", "funding"],
    "filters": {
      "minMomentum": 70,
      "minAmountUsd": 1000000,
      "languages": ["typescript", "python", "rust"]
    },
    "enabled": true
  }
]`;

const ERROR_ENVELOPE_EXAMPLE = `{
  "ok": false,
  "error": "Repo not found",
  "code": "repo_not_found",
  "details": ["vercel/next.js.invalid"]
}`;
