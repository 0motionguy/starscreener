// RelatedReposCard — 1:1 port of standalone PFRelated.
//
// Renders the "// RELATED REPOS · CROSS-SOURCE OVERLAP" card from
// Profile-standalone.html as a server component, using real derived data only:
//   - getRelatedReposFor(fullName) for the ordered list of related repos.
//   - getDerivedRepoByFullName(rel.fullName) to pull tags + per-source mention
//     counts + lastCommitAt off the underlying derived Repo. This is allowed
//     because the derived layer is already cached by data-version.
//
// DOM tree mirrors PFRelated in C:/tmp/asset_e0686a47.js lines 898-955:
//   .pf-rel
//     .pf-rel-rank          → "#01" zero-padded
//     .pf-rel-id
//       .pf-rel-logo        → first char of owner, uppercased
//       .pf-rel-text
//         .pf-rel-name      → owner / sep / name
//         .pf-rel-why       → tag chips inline + why prose
//     .pf-rel-mentions
//       .l                  → "CO-MENTIONS · 30D (N total)"
//       .pf-rel-srcs        → pills, each <SourceLogo/> + count
//     .pf-rel-meta
//       .stars              → "★ 12.4k"
//       .mom                → bar + numeric
//       .last               → "last · 2h ago"
//
// Source-key normalization: derived-repos uses SocialPlatform keys
// (twitter / reddit / hackernews / github / devto / bluesky /
// lobsters / npm / huggingface / arxiv / funding / tavily). The standalone
// uses `dev` as the dev.to key. SourceLogo's SourceName enum uses
// `x-twitter`, `devto`. We map: twitter→x-twitter, dev→devto, lobsters→
// (skip, no brand asset), funding/tavily→(skip, not a mention source for
// this UI). All other keys pass through.
//
// Empty state: card head + honest prose. No fabricated rows.

import Link from "next/link";

import { SourceLogo, type SourceName } from "@/components/icon/Icon";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { ageLabel } from "@/lib/format-age";
import type { RelatedRepoItem } from "@/lib/repo-related";
import type { Repo, RepoMentionsPerSource, SocialPlatform } from "@/lib/types";

interface RelatedReposCardProps {
  repo: Repo;
  related: RelatedRepoItem[];
}

// Per-source brand logo for a mention pill. Returns null when the source has
// no SourceLogo asset (lobsters / funding / tavily) — those pills are
// suppressed entirely rather than rendered with a wrong glyph.
function sourceLogoName(src: SocialPlatform): SourceName | null {
  switch (src) {
    case "twitter":
      return "x-twitter";
    case "reddit":
      return "reddit";
    case "hackernews":
      return "hackernews";
    case "github":
      return "github";
    case "devto":
      return "devto";
    case "bluesky":
      return "bluesky";
    case "huggingface":
      return "huggingface";
    case "arxiv":
      return "arxiv";
    case "npm":
      return "npm";
    case "lobsters":
    case "funding":
    case "tavily":
    default:
      return null;
  }
}

interface MentionPill {
  src: SocialPlatform;
  logo: SourceName;
  n: number;
}

function collectMentions(repo: Repo | null): MentionPill[] {
  const perSource = repo?.mentions?.perSource;
  if (!perSource) return [];
  const out: MentionPill[] = [];
  // Stable display order: github → hackernews → x → reddit → bluesky →
  // devto → huggingface → arxiv → npm. Mirrors the standalone's
  // PF_SRC_LOGO ordering for visual consistency.
  const order: SocialPlatform[] = [
    "github",
    "hackernews",
    "twitter",
    "reddit",
    "bluesky",
    "devto",
    "huggingface",
    "arxiv",
    "npm",
  ];
  for (const src of order) {
    const bucket = perSource[src] as RepoMentionsPerSource | undefined;
    const n = bucket?.count7d ?? 0;
    if (n <= 0) continue;
    const logo = sourceLogoName(src);
    if (!logo) continue;
    out.push({ src, logo, n });
  }
  return out;
}

function deriveWhy(item: RelatedRepoItem, source: Repo | null): string {
  if (item.relation === "fork") return "Fork lineage — shared upstream commits.";
  if (item.relation === "replacement") return "Drop-in replacement in this category.";
  if (item.relation === "sibling") return "Sibling project under the same org.";
  if (source?.tags && source.tags.length > 0) {
    return `Shared tag: ${source.tags[0]}.`;
  }
  if (item.language) return `${item.language} ecosystem peer.`;
  const trimmed = item.description?.trim();
  if (trimmed) return trimmed.length > 92 ? `${trimmed.slice(0, 89)}…` : trimmed;
  return "Shared ecosystem signal.";
}

function fmtStars(n: number): string {
  if (!Number.isFinite(n) || n < 1000) return n.toLocaleString("en-US");
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function clampMomentum(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function RelatedReposCard({ repo, related }: RelatedReposCardProps) {
  const items = Array.isArray(related) ? related.slice(0, 5) : [];

  // Hide the card entirely for low-signal registry-only repos: empty
  // results + fewer than 5 lifetime mentions total means we have neither
  // related data nor enough mention signal to make the empty state useful.
  // Established repos with mentions still see the empty-state message,
  // which correctly reads as "we have signal but nothing related yet".
  const totalMentions =
    (repo.mentions?.total ?? 0) +
    (repo.mentions?.total7d ?? 0) +
    (repo.mentions?.total24h ?? 0);
  if (items.length === 0 && totalMentions < 5) {
    return null;
  }

  return (
    <section className="pf-section">
      <div className="pf-card">
        <div className="pf-card-head">
          <h3>
            <span className="slash">{"// "}</span>RELATED REPOS · CROSS-SOURCE OVERLAP
          </h3>
          <div className="meta">
            {items.length} detected · 30d window
          </div>
        </div>

        {items.length === 0 ? (
          <div className="pf-card-body">
            No cross-source related repos detected in the last 30 days yet.
          </div>
        ) : (
          <div className="pf-related-list">
            {items.map((item, i) => {
              const [ownerSeg, nameSeg] = item.fullName.split("/");
              const owner = ownerSeg ?? "";
              const name = nameSeg ?? "";
              const href = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

              const source = getDerivedRepoByFullName(item.fullName);
              const tags = (source?.tags ?? []).slice(0, 3);
              const mentions = collectMentions(source);
              const total = mentions.reduce((s, m) => s + m.n, 0);
              const why = deriveWhy(item, source);
              const momentum = clampMomentum(item.momentumScore);
              const last = ageLabel(source?.lastCommitAt);
              const logoLetter = (owner.charAt(0) || "?").toUpperCase();

              return (
                <Link
                  key={item.fullName}
                  href={href}
                  className="pf-rel"
                  aria-label={`Open ${item.fullName} profile`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div className="pf-rel-rank">
                    #{String(i + 1).padStart(2, "0")}
                  </div>

                  <div className="pf-rel-id">
                    <div className="pf-rel-logo" aria-hidden="true">
                      {logoLetter}
                    </div>
                    <div className="pf-rel-text">
                      <div className="pf-rel-name">
                        <span className="owner">{owner}</span>
                        <span className="sep">/</span>
                        <span>{name}</span>
                      </div>
                      <div className="pf-rel-why">
                        {tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                        {why}
                      </div>
                    </div>
                  </div>

                  <div className="pf-rel-mentions">
                    <div className="l">CO-MENTIONS · 30D ({total} total)</div>
                    <div className="pf-rel-srcs">
                      {mentions.length === 0 ? (
                        <span className="pf-rel-src" title="No mentions in last 30 days">
                          <span>0</span>
                        </span>
                      ) : (
                        mentions.map((m) => (
                          <span
                            key={m.src}
                            className="pf-rel-src"
                            title={m.src}
                          >
                            <span className="logo">
                              <SourceLogo
                                source={m.logo}
                                size="xs"
                                alt=""
                              />
                            </span>
                            <span className="n">{m.n}</span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pf-rel-meta">
                    <div className="stars">★ {fmtStars(item.stars)}</div>
                    <div className="mom">
                      <span className="mom-bar">
                        <span
                          className="mom-fill"
                          style={{
                            width: `${momentum}%`,
                            display: "block",
                            height: "100%",
                          }}
                        />
                      </span>
                      <span className="mom-num">{momentum}</span>
                    </div>
                    <div className="last">last · {last}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
