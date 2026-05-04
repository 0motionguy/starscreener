// /agent-commerce/[slug] — entity detail page.
//
// Server component. Resolves slug → item from the data-store cache,
// renders score breakdown + sources + linked actions.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  CapabilityChips,
  PricingBadge,
  ProtocolList,
  ScoreBar,
  StatusBadges,
} from "@/components/agent-commerce/AgentCommerceBadges";
import {
  getAgentCommerceItem,
  getAgentCommerceItems,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import { getRepoProfile } from "@/lib/repo-profiles";

export const revalidate = 600;

interface DetailProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: DetailProps): Promise<Metadata> {
  const { slug } = await params;
  await refreshAgentCommerceFromStore();
  const item = getAgentCommerceItem(slug);
  if (!item) return { title: "Agent Commerce · Not found" };
  return {
    title: `${item.name} · Agent Commerce`,
    description: item.brief.slice(0, 160),
    alternates: { canonical: `/agent-commerce/${item.slug}` },
  };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getGradient(name: string): string {
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

function findRelated(
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

const SCORE_LABELS: { key: keyof AgentCommerceItem["scores"]; label: string }[] = [
  { key: "githubVelocity", label: "GitHub velocity" },
  { key: "socialMentions", label: "Social mentions" },
  { key: "pricingClarity", label: "Pricing clarity" },
  { key: "apiClarity", label: "API clarity" },
  { key: "aisoScore", label: "AISO score" },
  { key: "portalReady", label: "Portal Ready" },
];

export default async function AgentCommerceDetailPage({ params }: DetailProps) {
  const { slug } = await params;
  await refreshAgentCommerceFromStore();
  const item = getAgentCommerceItem(slug);
  if (!item) notFound();

  const related = findRelated(getAgentCommerceItems(), item);
  const externalHref =
    item.links.website ??
    (item.links.github ? `https://github.com/${item.links.github}` : null) ??
    item.links.docs ??
    null;

  // AISO scan lookup — repo-profiles.json is keyed by GitHub fullName, which
  // for agent-commerce items lives at item.links.github (item.id is a slug
  // like "tool:langchain"). When the GitHub link is missing or no profile
  // exists, the panel renders nothing.
  const repoProfile = item.links.github ? getRepoProfile(item.links.github) : null;
  const aisoScan = repoProfile?.aisoScan ?? null;

  return (
    <main className="home-surface ac-detail">
      <section className="page-head">
        <div>
          <div className="crumb">
            <Link href="/agent-commerce">Agent Commerce</Link> / {item.kind} / {item.category}
          </div>
        </div>
      </section>

      <header className="ac-detail-head">
        <div className="ac-logo" style={{ background: getGradient(item.name) }}>
          {getInitials(item.name)}
        </div>
        <div>
          <h1 className="ac-detail-name">{item.name}</h1>
          <p className="ac-detail-brief">{item.brief}</p>
          <div style={{ marginTop: 10 }}>
            <ProtocolList protocols={item.protocols} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <ScoreBar score={item.scores.composite} />
          {externalHref ? (
            <a className="ac-link" href={externalHref} target="_blank" rel="noreferrer">
              Visit ↗
            </a>
          ) : null}
        </div>
      </header>

      {item.live ? (
        <Card>
          <CardHeader
            showCorner
            right={
              item.live.fetchedAt ? (
                <span>
                  refreshed{" "}
                  {(() => {
                    const ms = Date.now() - new Date(item.live.fetchedAt).getTime();
                    const mins = Math.floor(ms / 60_000);
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 48) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                  })()}
                </span>
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
              {typeof item.live.stars === "number" ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Stars
                  </div>
                  <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 700 }}>
                    {item.live.stars.toLocaleString("en-US")}
                  </div>
                </div>
              ) : null}
              {typeof item.live.forks === "number" ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Forks
                  </div>
                  <div style={{ color: "var(--color-text-default)", fontSize: 20, fontWeight: 700 }}>
                    {item.live.forks.toLocaleString("en-US")}
                  </div>
                </div>
              ) : null}
              {item.live.pushedAt ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Last pushed
                  </div>
                  <div style={{ color: "#34d399", fontSize: 14, fontWeight: 700 }}>
                    {(() => {
                      const days = Math.max(
                        0,
                        Math.floor((Date.now() - new Date(item.live.pushedAt).getTime()) / 86_400_000),
                      );
                      return days === 0
                        ? "today"
                        : days === 1
                          ? "1 day ago"
                          : days < 30
                            ? `${days} days ago`
                            : days < 365
                              ? `${Math.floor(days / 30)} months ago`
                              : `${Math.floor(days / 365)} years ago`;
                    })()}
                  </div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10 }}>
                    {new Date(item.live.pushedAt).toISOString().slice(0, 10)}
                  </div>
                </div>
              ) : null}
              {item.live.language ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Language
                  </div>
                  <div style={{ color: "var(--color-text-default)", fontSize: 14, fontWeight: 700 }}>
                    {item.live.language}
                  </div>
                </div>
              ) : null}
              {typeof item.live.openIssues === "number" ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Open Issues
                  </div>
                  <div style={{ color: "var(--color-text-default)", fontSize: 14, fontWeight: 700 }}>
                    {item.live.openIssues.toLocaleString("en-US")}
                  </div>
                </div>
              ) : null}
              {typeof item.live.hnMentions90d === "number" && item.live.hnMentions90d > 0 ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    HN mentions (90d)
                  </div>
                  <div style={{ color: "#f97316", fontSize: 20, fontWeight: 700 }}>
                    {item.live.hnMentions90d}
                  </div>
                  {item.live.hnTopUrl ? (
                    <a
                      href={item.live.hnTopUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--color-text-faint)", fontSize: 10, textDecoration: "none" }}
                    >
                      top story →
                    </a>
                  ) : null}
                </div>
              ) : null}
              {typeof item.live.npmWeeklyDownloads === "number" && item.live.npmWeeklyDownloads > 0 ? (
                <div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    npm /wk
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 20, fontWeight: 700 }}>
                    {item.live.npmWeeklyDownloads >= 1_000_000
                      ? `${(item.live.npmWeeklyDownloads / 1_000_000).toFixed(2)}M`
                      : item.live.npmWeeklyDownloads >= 1000
                        ? `${(item.live.npmWeeklyDownloads / 1000).toFixed(1)}k`
                        : `${item.live.npmWeeklyDownloads}`}
                  </div>
                  {item.live.npmName ? (
                    <a
                      href={item.live.npmRegistryUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--color-text-faint)", fontSize: 10, textDecoration: "none" }}
                    >
                      {item.live.npmName} {item.live.npmLatestVersion ? `@${item.live.npmLatestVersion}` : ""} →
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {aisoScan && aisoScan.status === "completed" ? (
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
      ) : aisoScan && (aisoScan.status === "queued" || aisoScan.status === "running") ? (
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
      ) : null}

      <div className="ac-detail-grid">
        <div style={{ display: "grid", gap: 12 }}>
          <Card>
            <CardHeader showCorner right={<span>composite {item.scores.composite}</span>}>
              Score breakdown
            </CardHeader>
            <CardBody>
              <div className="ac-score-rows">
                {SCORE_LABELS.map(({ key, label }) => {
                  const raw = item.scores[key];
                  const n = typeof raw === "number" ? raw : 0;
                  const display = raw === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);
                  return (
                    <div className="ac-score-row" key={key}>
                      <span>{label}</span>
                      <span className="ac-score-track">
                        <i style={{ width: `${n}%` }} />
                      </span>
                      <span className="ac-score-num">{display}</span>
                    </div>
                  );
                })}
                {item.scores.hypePenalty > 0 ? (
                  <div className="ac-score-row" style={{ color: "#f87171" }}>
                    <span>Hype penalty</span>
                    <span className="ac-score-track">
                      <i style={{ width: `${item.scores.hypePenalty * 3.33}%`, background: "#f87171" }} />
                    </span>
                    <span className="ac-score-num">−{item.scores.hypePenalty}</span>
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader showCorner right={<span>{item.sources.length}</span>}>
              Sources
            </CardHeader>
            <CardBody>
              <ul className="ac-source-list">
                {item.sources.map((src, i) => (
                  <li key={`${src.source}-${i}`}>
                    <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-faint)" }}>
                      {src.source}
                    </span>
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.url.replace(/^https?:\/\//, "")}
                    </a>
                    <span style={{ textAlign: "right" }}>{src.signalScore}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Card>
            <CardHeader showCorner>Status</CardHeader>
            <CardBody>
              <div style={{ display: "grid", gap: 10 }}>
                <StatusBadges badges={item.badges} />
                <PricingBadge pricing={item.pricing} />
                {item.capabilities.length > 0 ? (
                  <CapabilityChips capabilities={item.capabilities} />
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader showCorner>Links</CardHeader>
            <CardBody>
              <ul className="ac-source-list">
                {item.links.website ? (
                  <li>
                    <span>WEBSITE</span>
                    <a href={item.links.website} target="_blank" rel="noreferrer">
                      {item.links.website.replace(/^https?:\/\//, "")}
                    </a>
                    <span />
                  </li>
                ) : null}
                {item.links.github ? (
                  <li>
                    <span>GITHUB</span>
                    <a
                      href={`https://github.com/${item.links.github}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.links.github}
                    </a>
                    <span />
                  </li>
                ) : null}
                {item.links.docs ? (
                  <li>
                    <span>DOCS</span>
                    <a href={item.links.docs} target="_blank" rel="noreferrer">
                      {item.links.docs.replace(/^https?:\/\//, "")}
                    </a>
                    <span />
                  </li>
                ) : null}
                {item.links.portalManifest ? (
                  <li>
                    <span>PORTAL</span>
                    <a href={item.links.portalManifest} target="_blank" rel="noreferrer">
                      {item.links.portalManifest.replace(/^https?:\/\//, "")}
                    </a>
                    <span />
                  </li>
                ) : null}
                {item.links.callEndpoint ? (
                  <li>
                    <span>CALL</span>
                    <a href={item.links.callEndpoint} target="_blank" rel="noreferrer">
                      {item.links.callEndpoint.replace(/^https?:\/\//, "")}
                    </a>
                    <span />
                  </li>
                ) : null}
              </ul>
            </CardBody>
          </Card>

          {related.length > 0 ? (
            <Card>
              <CardHeader showCorner>Related</CardHeader>
              <CardBody>
                <ul className="ac-source-list">
                  {related.map((rel) => (
                    <li key={rel.id}>
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-faint)" }}>
                        {rel.kind}
                      </span>
                      <Link href={`/agent-commerce/${rel.slug}`}>{rel.name}</Link>
                      <span style={{ textAlign: "right" }}>{rel.scores.composite}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {item.tags.map((tag) => (
          <span key={tag} className="ac-cap">
            {tag}
          </span>
        ))}
      </div>
    </main>
  );
}
