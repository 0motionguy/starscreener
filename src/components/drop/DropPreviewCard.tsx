import { FreshnessPill } from "@/components/shell/FreshnessPill";

export interface DropPreviewMetadata {
  owner: string;
  name: string;
  description?: string | null;
  language?: string | null;
  license?: string | null;
  stars?: number | null;
  starDelta30d?: number | null;
  forks?: number | null;
  forkDelta30d?: number | null;
  contributors?: number | null;
  activeContributors?: number | null;
  trackedCount?: number | null;
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
  return c.slice(0, 1).toUpperCase() || ".";
}

function smarkClass(platform: string): string {
  return PLATFORM_SMARK_CLASS[platform.trim().toLowerCase()] ?? "github";
}

function formatNumber(n: number | null | undefined, fallback = "-"): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat("en-US").format(n);
}

export function DropPreviewCard({ metadata }: DropPreviewCardProps) {
  if (!metadata) {
    return (
      <div className="preview-card" data-state="empty">
        <div className="card-title" style={{ marginBottom: 14 }}>
          | <b>Live preview</b> - paste a URL above to populate
        </div>
        <div
          style={{
            padding: "24px 8px",
            color: "var(--fg-faint)",
            fontSize: 12,
          }}
        >
          Once you fetch metadata, this card shows the intake snapshot reviewers
          use: repository metadata, source marks, and review notes.
        </div>
      </div>
    );
  }

  const stars = metadata.stars ?? 0;
  const contributors = metadata.contributors ?? 0;
  const mentionCount = metadata.mentions?.length ?? 0;
  const title = metadata.name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const avatarSeed = (metadata.owner + metadata.name).slice(0, 2).toUpperCase();

  return (
    <div className="preview-card" data-state="filled">
      <div className="card-title" style={{ marginBottom: 14 }}>
        | <b>Live preview</b> - how your repo enters review
      </div>

      <div
        className="hero-row"
        style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
      >
        <div
          className="repo-avatar lg"
          style={{
            background: "var(--surface-3)",
            color: "var(--accent)",
            fontSize: 22,
          }}
        >
          {avatarSeed}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hero-handle">
            <span style={{ color: "var(--fg-subtle)" }}>{metadata.owner}</span>/
            <span style={{ color: "var(--fg-bright)", fontWeight: 600 }}>
              {metadata.name}
            </span>
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              - {metadata.language ?? "unknown"} - {metadata.license ?? "license pending"}
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
              letterSpacing: 0,
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
            <span className="tag info">OPEN DROP</span>
            <FreshnessPill source="repos" fetchedAt={metadata.fetchedAt ?? null} />
          </div>
        </div>
      </div>

      <div className="divider" style={{ margin: "18px 0" }} />

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
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {formatNumber(stars)}
          </div>
          <div className="kpi-delta up">
            +{formatNumber(metadata.starDelta30d ?? 0)} 30d
          </div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Contributors</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {formatNumber(contributors)}
          </div>
          <div className="kpi-delta fl">
            {formatNumber(metadata.activeContributors ?? contributors)} active
          </div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Forks</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {formatNumber(metadata.forks)}
          </div>
          <div className="kpi-delta up">
            +{formatNumber(metadata.forkDelta30d ?? 0)} 30d
          </div>
        </div>
        <div className="kpi" style={{ padding: "10px 12px" }}>
          <div className="kpi-label">Source marks</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {mentionCount}
          </div>
          <div className="kpi-delta fl">review evidence</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          | Cross-source pre-scan - {mentionCount} source mark
          {mentionCount === 1 ? "" : "s"} detected
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <span className="chip">
            <span className="smark github">G</span> {formatNumber(stars)} stars
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
          | Review packet
        </div>
        <div className="col gap-2">
          <span className="muted" style={{ fontSize: 11 }}>
            This packet attaches fetched metadata, source marks, category, tags,
            and the submitter note to the review queue.
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            Ranking and listing decisions are computed only after submission and
            review.
          </span>
        </div>
      </div>
    </div>
  );
}
