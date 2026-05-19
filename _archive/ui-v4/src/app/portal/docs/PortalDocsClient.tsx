"use client";

// TrendingRepo - /portal/docs client shell.
//
// Tab state + copy-to-clipboard lives here. The tool list is passed from the
// server wrapper as plain metadata so this client bundle stays free of any
// server-only pipeline imports.

import { useState } from "react";
import Link from "next/link";
import { Plug, Terminal, Copy, Check } from "lucide-react";

import { APP_VERSION } from "@/lib/app-meta";

type Tab = "mcp" | "rest";

export interface PortalDocsTool {
  name: string;
  description: string;
  portalParams: Record<
    string,
    { type: string; required?: boolean; description?: string }
  >;
}

// Portal v0.1 wire format calls the method key "tool", not "method".
// Matches src/portal/dispatcher.ts — keep these strings in lock-step.
const LIVE_BASE = "https://trendingrepo.com";

const VISIT_CLI = `# Portal visitor CLI (spec-native, works against any /portal endpoint)
npx @visitportal/visit ${LIVE_BASE}/portal top_gainers --limit=10`;

const MCP_INSTALL = `# Claude Code — register TrendingRepo as an HTTP MCP bridge
# via the Portal adapter. No local checkout required.
claude mcp add trendingrepo \\
  --transport http \\
  --url ${LIVE_BASE}/portal

# Or pipe the manifest straight into your agent
curl ${LIVE_BASE}/portal | jq`;

const CURL_EXAMPLE = `curl -X POST ${LIVE_BASE}/portal/call \\
  -H "Content-Type: application/json" \\
  -d '{"tool":"search_repos","params":{"query":"agent","limit":5}}'`;

export default function PortalDocsClient({
  tools,
}: {
  tools: PortalDocsTool[];
}) {
  const [tab, setTab] = useState<Tab>("mcp");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-8">
        <span className="label-micro">MCP Portal · v0.1</span>
        {/* Wire-protocol vs app-build clarifier. The `v0.1` above is the
            Portal protocol — the shape of /portal request + response
            envelopes — and only bumps on a breaking schema change. The
            TrendingRepo web app itself ships separate semver builds via
            package.json (linked below). */}
        <p
          className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Wire protocol version · App build v{APP_VERSION} ·{" "}
          <Link
            href="/api/health/portal"
            className="hover:text-[color:var(--v3-acc)]"
            style={{ color: "var(--v3-ink-300)" }}
          >
            /api/health/portal
          </Link>
        </p>
        <h1 className="font-display text-4xl sm:text-5xl mt-2 mb-3">
          Plug TrendingRepo into any agent.
        </h1>
        <p className="text-text-secondary text-md max-w-2xl leading-relaxed">
          Point your Claude, OpenAI, or custom LLM at our read-only tool
          surface. No auth, no keys, no setup - just top gainers,
          full-text search, and maintainer rollups piped through either
          MCP or plain HTTP.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Integration mode"
        className="inline-flex items-center gap-1 border border-border-primary rounded-button p-1 bg-bg-card mb-6"
      >
        <TabButton active={tab === "mcp"} onClick={() => setTab("mcp")}>
          <Plug className="w-3.5 h-3.5" /> MCP
        </TabButton>
        <TabButton active={tab === "rest"} onClick={() => setTab("rest")}>
          <Terminal className="w-3.5 h-3.5" /> REST
        </TabButton>
      </div>

      {tab === "mcp" ? <McpTab tools={tools} /> : <RestTab />}

      <p className="mt-10 text-xs font-mono text-text-tertiary">
        Raw manifest:{" "}
        <Link
          href="/portal"
          className="text-brand hover:text-brand-hover underline decoration-dotted"
        >
          GET /portal
        </Link>
        {"  ·  "}Call endpoint: POST /portal/call
      </p>
    </div>
  );
}

function McpTab({ tools }: { tools: PortalDocsTool[] }) {
  return (
    <div className="space-y-8">
      <section>
        <span className="label-section">Register with Claude</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          Claude Code speaks the Model Context Protocol over HTTP. Point it
          at our live Portal endpoint and every tool below becomes callable
          from the agent — no local checkout, no bundled binary, no keys.
        </p>
        <CodeBlock value={MCP_INSTALL} />
      </section>

      <section>
        <span className="label-section">Visitor CLI</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          For one-off queries from a terminal, the spec-native{" "}
          <span className="font-mono text-text-primary">
            @visitportal/visit
          </span>{" "}
          CLI speaks Portal v0.1 directly:
        </p>
        <CodeBlock value={VISIT_CLI} />
      </section>

      <section>
        <span className="label-section">Tools · {tools.length}</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          Every tool below is also callable over REST. Params are
          validated at the boundary and errors come back as typed codes
          (<span className="font-mono">INVALID_PARAMS</span>,{" "}
          <span className="font-mono">NOT_FOUND</span>).
        </p>
        <ul className="v2-card divide-y divide-[color:var(--v2-line-std)] overflow-hidden">
          {tools.map((tool) => (
            <li key={tool.name} className="p-4">
              <div className="font-mono text-sm text-brand mb-1">
                {tool.name}
              </div>
              <p className="text-text-secondary text-sm leading-relaxed">
                {tool.description}
              </p>
              {Object.keys(tool.portalParams).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(tool.portalParams).map(([k, v]) => (
                    <span
                      key={k}
                      className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary border border-border-secondary"
                    >
                      {k}
                      {v.required ? "*" : ""}
                      <span className="text-text-muted">:{v.type}</span>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RestTab() {
  return (
    <div className="space-y-8">
      <section>
        <span className="label-section">Call any tool over HTTP</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          POST a JSON body to{" "}
          <span className="font-mono text-text-primary">/portal/call</span>{" "}
          with a <span className="font-mono">tool</span> (name from the
          manifest) and <span className="font-mono">params</span> object —
          Portal v0.1 wire format. The response shape is{" "}
          <span className="font-mono">{"{ ok: true, result }"}</span> on a
          successful dispatch or{" "}
          <span className="font-mono">
            {"{ ok: false, error, code }"}
          </span>{" "}
          on a handled failure. Rate-limited responses come back as HTTP
          429 with{" "}
          <span className="font-mono">
            code: &quot;RATE_LIMITED&quot;
          </span>{" "}
          and a <span className="font-mono">Retry-After</span> header.
        </p>
        <CodeBlock value={CURL_EXAMPLE} />
      </section>

      <section>
        <span className="label-section">Response shape</span>
        <ul className="mt-3 space-y-2 text-text-secondary text-sm leading-relaxed list-disc pl-5">
          <li>
            <span className="font-mono text-text-primary">ok</span> -
            boolean. <span className="font-mono">true</span> means the
            tool ran and returned data.
          </li>
          <li>
            <span className="font-mono text-text-primary">result</span> -
            the tool&apos;s typed payload (e.g. a{" "}
            <span className="font-mono">repos[]</span> array for
            search_repos). Shape matches the tool&apos;s output contract
            in <span className="font-mono">src/tools/types.ts</span>.
          </li>
          <li>
            <span className="font-mono text-text-primary">error</span> /{" "}
            <span className="font-mono">code</span> - on failure. Codes
            are stable strings, safe to branch on.
          </li>
        </ul>
      </section>

      <section>
        <span className="label-section">CORS</span>
        <p className="mt-2 text-text-secondary text-sm leading-relaxed">
          The endpoint echoes the request Origin, so browser-resident
          agents can call it directly from any host. No preflight
          surprises.
        </p>
      </section>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="v2-mono flex items-center gap-1.5 px-3 py-1.5 transition-colors"
      style={{
        fontSize: 11,
        background: active ? "var(--v2-acc-soft)" : "transparent",
        color: active ? "var(--v2-acc)" : "var(--v2-ink-300)",
        borderRadius: 2,
      }}
    >
      {children}
    </button>
  );
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="relative group">
      <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto whitespace-pre text-text-primary">
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy to clipboard"
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-button border border-border-primary bg-bg-primary text-text-tertiary hover:text-brand hover:border-brand opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-accent-green" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
