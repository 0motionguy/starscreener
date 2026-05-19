// Co-located helpers + sections for /agent-commerce/[slug].
// Extracted from page.tsx (A30 refactor) — server-only, no client islands.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import type { AisoToolsScan } from "@/lib/aiso-tools";

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getGradient(name: string): string {
  const grads = [
    "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
    "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    "linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)",
    "linear-gradient(135deg, #f97316 0%, #c2410c 100%)",
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return grads[hash % grads.length];
}

export function findRelated(
  items: AgentCommerceItem[],
  target: AgentCommerceItem,
): AgentCommerceItem[] {
  return items
    .filter(
      (it) =>
        it.id !== target.id &&
        (it.category === target.category || it.kind === target.kind),
    )
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 4);
}

export const SCORE_LABELS: {
  key: keyof AgentCommerceItem["scores"];
  label: string;
}[] = [
  { key: "githubVelocity", label: "GitHub velocity" },
  { key: "socialMentions", label: "Social mentions" },
  { key: "pricingClarity", label: "Pricing clarity" },
  { key: "apiClarity", label: "API clarity" },
  { key: "aisoScore", label: "AISO score" },
  { key: "portalReady", label: "Portal Ready" },
];

const LABEL_STYLE = {
  color: "var(--color-text-faint)",
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

function formatRefreshed(fetchedAt: string): string {
  const ms = Date.now() - new Date(fetchedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatPushedAt(pushedAt: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86_400_000),
  );
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function formatNpmDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function LiveSignalsCard({
  live,
}: {
  live: NonNullable<AgentCommerceItem["live"]>;
}) {
  return (
    <Card>
      <CardHeader
        showCorner
        right={
          live.fetchedAt ? (
            <span>refreshed {formatRefreshed(live.fetchedAt)}</span>
          ) : null
        }
      >
        Live signals
      </CardHeader>
      <CardBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
            padding: "12px 14px",
            fontFamily: "var(--font-mono, ui-monospace)",
            fontSize: 12,
          }}
        >
          {typeof live.stars === "number" ? (
            <div>
              <div style={LABEL_STYLE}>Stars</div>
              <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 700 }}>
                {live.stars.toLocaleString("en-US")}
              </div>
            </div>
          ) : null}
          {typeof live.forks === "number" ? (
            <div>
              <div style={LABEL_STYLE}>Forks</div>
              <div style={{ color: "var(--color-text-default)", fontSize: 20, fontWeight: 700 }}>
                {live.forks.toLocaleString("en-US")}
              </div>
            </div>
          ) : null}
          {live.pushedAt ? (
            <div>
              <div style={LABEL_STYLE}>Last pushed</div>
              <div style={{ color: "#34d399", fontSize: 14, fontWeight: 700 }}>
                {formatPushedAt(live.pushedAt)}
              </div>
              <div style={{ color: "var(--color-text-faint)", fontSize: 10 }}>
                {new Date(live.pushedAt).toISOString().slice(0, 10)}
              </div>
            </div>
          ) : null}
          {live.language ? (
            <div>
              <div style={LABEL_STYLE}>Language</div>
              <div style={{ color: "var(--color-text-default)", fontSize: 14, fontWeight: 700 }}>
                {live.language}
              </div>
            </div>
          ) : null}
          {typeof live.openIssues === "number" ? (
            <div>
              <div style={LABEL_STYLE}>Open Issues</div>
              <div style={{ color: "var(--color-text-default)", fontSize: 14, fontWeight: 700 }}>
                {live.openIssues.toLocaleString("en-US")}
              </div>
            </div>
          ) : null}
          {typeof live.hnMentions90d === "number" && live.hnMentions90d > 0 ? (
            <div>
              <div style={LABEL_STYLE}>HN mentions (90d)</div>
              <div style={{ color: "#f97316", fontSize: 20, fontWeight: 700 }}>
                {live.hnMentions90d}
              </div>
              {live.hnTopUrl ? (
                <a
                  href={live.hnTopUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--color-text-faint)", fontSize: 10, textDecoration: "none" }}
                >
                  top story →
                </a>
              ) : null}
            </div>
          ) : null}
          {typeof live.npmWeeklyDownloads === "number" && live.npmWeeklyDownloads > 0 ? (
            <div>
              <div style={LABEL_STYLE}>npm /wk</div>
              <div style={{ color: "#cbd5e1", fontSize: 20, fontWeight: 700 }}>
                {formatNpmDownloads(live.npmWeeklyDownloads)}
              </div>
              {live.npmName ? (
                <a
                  href={live.npmRegistryUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--color-text-faint)", fontSize: 10, textDecoration: "none" }}
                >
                  {live.npmName} {live.npmLatestVersion ? `@${live.npmLatestVersion}` : ""} →
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function AisoScanSection({ aisoScan }: { aisoScan: AisoToolsScan }) {
  if (aisoScan.status === "completed") {
    return (
      <Card>
        <CardHeader
          showCorner
          right={
            aisoScan.tier ? (
              <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {aisoScan.tier}
              </span>
            ) : null
          }
        >
          AS · AISO score
        </CardHeader>
        <CardBody>
          <div style={{ padding: "12px 14px", display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--color-text-default)",
                  lineHeight: 1,
                }}
              >
                {aisoScan.score ?? "—"}
              </span>
              {aisoScan.tier ? (
                <span
                  style={{
                    fontFamily: "var(--font-mono, ui-monospace)",
                    fontSize: 12,
                    color: "var(--color-text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  · {aisoScan.tier}-tier
                </span>
              ) : null}
            </div>

            {aisoScan.dimensions.length > 0 ? (
              <div className="ac-score-rows">
                {aisoScan.dimensions.map((d) => {
                  const n = Math.max(0, Math.min(100, d.score));
                  return (
                    <div className="ac-score-row" key={d.key}>
                      <span>{d.label}</span>
                      <span className="ac-score-track">
                        <i style={{ width: `${n}%` }} />
                      </span>
                      <span className="ac-score-num">{n}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {aisoScan.issues.length > 0 ? (
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 4,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 11,
                }}
              >
                {aisoScan.issues.slice(0, 5).map((issue, i) => (
                  <li
                    key={`${issue.severity}-${i}`}
                    style={{ color: "var(--color-text-default)" }}
                  >
                    <span
                      style={{
                        color: "var(--color-text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginRight: 8,
                      }}
                    >
                      [{issue.severity}]
                    </span>
                    {issue.title}
                  </li>
                ))}
              </ul>
            ) : null}

            <div
              style={{
                fontFamily: "var(--font-mono, ui-monospace)",
                fontSize: 10,
                color: "var(--color-text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Last scanned{" "}
              {aisoScan.completedAt
                ? new Date(aisoScan.completedAt).toISOString().slice(0, 10)
                : "—"}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (aisoScan.status === "queued" || aisoScan.status === "running") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
          background: "var(--color-bg-soft, rgba(255,255,255,0.03))",
          fontFamily: "var(--font-mono, ui-monospace)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-text-faint)",
        }}
      >
        AISO scan in progress
      </div>
    );
  }

  return null;
}
