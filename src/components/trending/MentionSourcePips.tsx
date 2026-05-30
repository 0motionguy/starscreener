// MentionSourcePips — emits .source-pips strip with brand-mark SVGs per
// active mention channel. Server component.
//
// Only ACTIVE sources render (channels with cumulative count > 0). Reads
// the new ledger field `perSource[key].count` (Phase B / mentions-ledger)
// and falls through to legacy `count24h` for one deploy cycle of
// backwards-compat. Total reads `mentions.total ?? mentions.total24h ?? 0`.
//
// Revive 2026-05-23: replaced 26 hex-literal hand-crafted SVGs with
// <SourceLogo /> reading from public/brand/sources/*.svg. See
// docs/DESIGN-SYSTEM.md §9.3 (Source brand logos).

import type { Repo, RepoMentionsRollup, SocialPlatform } from "@/lib/types";
import { SourceLogo, type SourceName } from "@/components/icon/Icon";

const CHANNELS: {
  key: SocialPlatform;
  cls: string;
  logo: SourceName | null;
  title: string;
}[] = [
  { key: "github", cls: "github", logo: "github", title: "GitHub" },
  { key: "hackernews", cls: "hn", logo: "hackernews", title: "Hacker News" },
  { key: "twitter", cls: "x", logo: "x-twitter", title: "X / Twitter" },
  { key: "reddit", cls: "reddit", logo: "reddit", title: "Reddit" },
  { key: "bluesky", cls: "bsky", logo: "bluesky", title: "Bluesky" },
  { key: "devto", cls: "devto", logo: "devto", title: "Dev.to" },
  { key: "huggingface", cls: "hf", logo: "huggingface", title: "Hugging Face" },
  { key: "arxiv", cls: "arxiv", logo: "arxiv", title: "arXiv" },
  { key: "npm", cls: "npm", logo: "npm", title: "npm" },
  // Lobsters has no brand logo in /public/brand/sources/ yet — falls back to
  // a colored letterform inside the pip via the .spip.lobsters CSS rule.
  { key: "lobsters", cls: "lobsters", logo: null, title: "Lobsters" },
];

const PIPS_VISIBLE = 6;
const CELL_VISIBLE = 4;

/**
 * AISO anchor pip — rendered first (leftmost) on every row. AISO is the
 * AI-readiness scan that every tracked repo is eligible for, so it's a
 * constant brand anchor rather than a count-gated mention channel. Kept in
 * a fixed leading slot so a column of cells reads as a clean left rail.
 */
function AisoPip({ wrapperClass }: { wrapperClass: string }) {
  return (
    <span
      className={`${wrapperClass} aiso`}
      title="AISO · AI-readiness"
      aria-label="AISO AI-readiness"
    >
      <SourceLogo source="aiso" size="md" alt="" />
    </span>
  );
}

interface MentionSourcePipsProps {
  repo: Pick<Repo, "mentions">;
}

/** Read the cumulative count for a source. Priority:
 *  1. `count` — new mentions-ledger cumulative field (Phase B)
 *  2. `count24h` — legacy 24h bucket
 *  3. `count7d` — legacy 7d bucket (Bluesky/DevTo/Lobsters bundled data only
 *     populates this — without the fallback their pips never render).
 *  Returns the max so a source with ANY mentions in EITHER window shows. */
function sourceCount(
  perSource: RepoMentionsRollup["perSource"] | undefined,
  key: SocialPlatform,
): number {
  const channel = perSource?.[key];
  if (!channel) return 0;
  return (
    channel.count ??
    Math.max(channel.count24h ?? 0, channel.count7d ?? 0)
  );
}

export function MentionSourcePips({ repo }: MentionSourcePipsProps) {
  const rollup = repo.mentions?.perSource;
  // Canonical left-to-right order: CHANNELS declaration order is the fixed
  // platform sequence (GitHub → HN → X → Reddit → Bluesky → Dev.to → PH →
  // HF → arXiv → npm → Lobsters). `.filter` preserves that order so the same
  // platform always sits in the same relative slot across rows.
  const active = CHANNELS
    .map((ch) => ({ ...ch, n: sourceCount(rollup, ch.key) }))
    .filter((ch) => ch.n > 0);

  const visible = active.slice(0, PIPS_VISIBLE);
  const overflow = active.length - visible.length;

  return (
    <div className="source-pips">
      <AisoPip wrapperClass="spip" />
      {visible.map(({ key, cls, logo, title, n }) => (
        <span
          key={key}
          className={`spip ${cls}`}
          title={`${title} · ${n}`}
          aria-label={`${title}: ${n} mentions`}
        >
          {logo ? (
            <SourceLogo source={logo} size="md" alt="" />
          ) : (
            <span className="spip-letter" aria-hidden="true">{title[0]}</span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="spip-more" title={`${overflow} more`}>+{overflow}</span>
      )}
    </div>
  );
}

interface MentionCellProps {
  repo: Pick<Repo, "mentions" | "mentionCount24h">;
}

/** Combined Mentions cell — AISO anchor pip + canonical-order source logos.
 *  No raw count number (removed 2026-05-25); the logos themselves carry the
 *  "which channels" signal and the per-pip title still surfaces the count on
 *  hover. */
export function MentionCell({ repo }: MentionCellProps) {
  const rollup = repo.mentions?.perSource;
  // Canonical platform order via CHANNELS declaration order — see
  // MentionSourcePips for the rationale. `.filter` preserves it.
  const active = CHANNELS.filter(({ key }) => sourceCount(rollup, key) > 0);
  const visible = active.slice(0, CELL_VISIBLE);
  const overflow = active.length - visible.length;
  const top = active[0];

  // Every row carries the AISO anchor pip, so there is no longer an
  // all-empty state — the cell always renders at least AISO.
  return (
    <div className="mention-pack">
      <span className="ms-pips">
        <AisoPip wrapperClass="smark" />
        {visible.map(({ key, cls, logo, title }) => {
          const n = sourceCount(rollup, key);
          return (
            <span
              key={cls}
              className={`smark ${cls}`}
              title={`${title} · ${n}`}
              aria-label={`${title}: ${n} mentions`}
            >
              {logo ? (
                <SourceLogo source={logo} size="md" alt="" />
              ) : (
                <span className="smark-letter" aria-hidden="true">{title[0]}</span>
              )}
            </span>
          );
        })}
        {overflow > 0 && (
          <span className="ms-more" title={`${overflow} more`}>+{overflow}</span>
        )}
      </span>
      {top && <span className="ms-top">live on {top.title}</span>}
    </div>
  );
}
