// DropPreviewCard — live preview of how a fetched repo will look on
// /trending. Server component: the page passes in a snapshot of
// metadata (resolved from a server-side GET to /api/repos/[owner]/[name]
// once the URL is provided via ?owner= + ?name=). The companion client
// component DropUrlInputCard surfaces the in-browser fetch.
//
// Projected score uses cross-source mention count as a proxy when the
// repo is not yet tracked. The number is intentionally approximate —
// the real scoring pipeline runs after submission.

import { FreshnessPill } from "@/components/shell/FreshnessPill";

interface DropPreviewMetadata {
  owner: string;
  name: string;
  description?: string | null;
  language?: string | null;
  license?: string | null;
  stars?: number | null;
  forks?: number | null;
  contributors?: number | null;
  pypiWeekly?: number | null;
  mentions?: Array<{
    platform: string;
    label: string;
    count?: number;
  }>;
  fetchedAt?: string | null;
}

interface DropPreviewCardProps {
  metadata: DropPreviewMetadata | null;
}

const PLATFORM_SMARK_CLASS: Record<string, string> = {
  github: "github",
  hn: "hn",
  hackernews: "hn",
  reddit: "reddit",
  devto: "devto",
  bluesky: "bluesky",
  producthunt: "producthunt",
  lobsters: "lobsters",
  twitter: "twitter",
  arxiv: "arxiv",
};

function smarkLetter(platform: string): string {
  const c = platform.trim().toLowerCase();
  if (c === "hackernews" || c === "hn") return "H";
  if (c === "devto") return "D";
  if (c === "reddit") return "R";
  if (c === "bluesky") return "B";
  if (c === "producthunt") return "P";
  if (c === "lobsters") return "L";
  if (c === "twitter") return "X";
  if (c === "arxiv") return "A";
  return c.slice(0, 1).toUpperCase() || "·";
}

function smarkClass(platform: string): string {
  return PLATFORM_SMARK_CLASS[platform.trim().toLowerCase()] ?? "github";
}

function projectScore(stars: number, mentions: number, contributors: number): number {
  // Lightweight model: log of stars + mention count weight + contributor bonus.
  // Caps at 100. The real pipeline reruns after submission.
  const starsScore = Math.min(60, Math.log10(Math.max(1, stars)) * 18);
  const mentionScore = Math.min(25, mentions * 4);
  const contribScore = Math.min(15, Math.log10(Math.max(1, contributors)) * 9);
  return Math.round(starsScore + mentionScore + contribScore);
}

function promoteProbability(score: number, mentions: number): number {
  // Threshold-style sigmoid-lite. ≥2 mentions + score ≥50 ≈ 70%+.
  const base = Math.min(95, score + mentions * 4);
  return Math.max(5, Math.min(95, base));
}

function formatNumber(n: number | null | undefined, fallback = "—"): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat("en-US").format(n);
}

export function DropPreviewCard({ metadata }: DropPreviewCardProps) {
  if (!metadata) {
    return (
      <div className="preview-card" data-state="empty">
        <div className="card-title" style={{ marginBottom: 14 }}>
          ▌ <b>Live preview</b> · paste a URL above to populate
        </div>
        <div style={{ padding: "24px 8px", color: "var(--fg-faint)", fontSize: 12 }}>
          Once you fetch metadata, this card shows how your repo will appear on{" "}
          <code>/trending</code> alongside the projected initial score and promote
          probability.
        </div>
      </div>
    );
  }

  const stars = metadata.stars ?? 0;
  const contributors = metadata.contributors ?? 0;
  const mentionCount = metadata.mentions?.length ?? 0;
  const score = projectScore(stars, mentionCount, contributors);
  const promoteProb = promoteProbability(score, mentionCount);
  const handle = `${metadata.owner}/${metadata.name}`;
  const title = metadata.name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const avatarSeed = (metadata.owner + metadata.name).slice(0, 2).toUpperCase();

  return (
    <div className="preview-card" data-state="filled">
      <div className="card-title" style={{ marginBottom: 14 }}>
        ▌ <b>Live preview</b> · how your repo will show on /trending
      </div>

      <div className="hero-row" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div
          className="repo-avatar lg"
          style={{ background: "#16093a", color: "#a78bfa", fontSize: 22 }}
        >
          {avatarSeed}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hero-handle">
            <span style={{ color: "var(--fg-subtle)" }}>{metadata.owner}</span>/
            <span style={{ color: "var(--fg-bright)", fontWeight: 600 }}>{metadata.name}</span>
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              · {metadata.language ?? "—"} · {metadata.license ?? "—"}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1.15,
              color: "var(--fg-bright)",
              margin: "4px 0 2px",
              letterSpacing: "-0.015em",
            }}
          >
            {title}
          </div>
          {metadata.description ? (
            <p
              style={{
                color: "var(--fg-muted)",
                fontSize: 12.5,
                lineHeight: 1.5,
                margin: "6px 0 8px",
              }}
            >
              {metadata.description}
            </p>
          ) : null}
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {metadata.language ? (
              <span className="tag brand">{metadata.language.toUpperCase()}</span>
            ) : null}
            <span className="tag info">○ NEW DROP</span>
            <FreshnessPill source="repos" fetchedAt={metadata.fetchedAt ?? null} />
          </div>
        </div>
      </div>

      <div className="divider" style={{ margin: "18px 0" }}></div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--border-subtle)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Stars</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatNumber(stars)}</div>
          <div className="kpi-delta fl">— at submit</div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Contributors</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatNumber(contributors)}</div>
          <div className="kpi-delta fl">— at submit</div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Forks</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatNumber(metadata.forks)}</div>
          <div className="kpi-delta fl">— at submit</div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Mentions</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{mentionCount}</div>
          <div className="kpi-delta fl">cross-source</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          ▌ Cross-source pre-scan · {mentionCount} mention{mentionCount === 1 ? "" : "s"} detected
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <span className="chip">
            <span className="smark github">G</span> {formatNumber(stars)} ★
          </span>
          {metadata.mentions?.map((m, i) => (
            <span key={`${m.platform}-${i}`} className="chip">
              <span className={`smark ${smarkClass(m.platform)}`}>
                {smarkLetter(m.platform)}
              </span>{" "}
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          ▌ Projected initial score
        </div>
        <div className="row gap-3">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              background: "linear-gradient(135deg, var(--accent), var(--warning))",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {score}
          </div>
          <div className="col gap-2" style={{ flex: 1 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              Predicted promote probability:{" "}
              <b className="accent-text">{promoteProb}%</b> based on metadata
              {mentionCount > 0 ? ` + ${mentionCount}-source pre-scan` : ""}
            </span>
            <span className="muted" style={{ fontSize: 11 }}>
              Real ranking computed after submission + intake pipeline scan.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { DropPreviewMetadata };
