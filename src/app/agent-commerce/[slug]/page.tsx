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
import { getRepoProfile } from "@/lib/repo-profiles";

import {
  AisoScanSection,
  LiveSignalsCard,
  SCORE_LABELS,
  findRelated,
  getGradient,
  getInitials,
} from "./_sections";

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

      {item.live ? <LiveSignalsCard live={item.live} /> : null}

      {aisoScan ? <AisoScanSection aisoScan={aisoScan} /> : null}

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
