// MentionSourcePips — emits .source-pips strip with brand-mark SVGs per
// active mention channel. Server component.
//
// Only ACTIVE sources render (channels with cumulative count > 0). Reads
// the new ledger field `perSource[key].count` (Phase B / mentions-ledger)
// and falls through to legacy `count24h` for one deploy cycle of
// backwards-compat. Total reads `mentions.total ?? mentions.total24h ?? 0`.

import type { Repo, RepoMentionsRollup, SocialPlatform } from "@/lib/types";

const CHANNELS: { key: SocialPlatform; cls: string; title: string }[] = [
  { key: "github", cls: "github", title: "GitHub" },
  { key: "hackernews", cls: "hn", title: "Hacker News" },
  { key: "twitter", cls: "x", title: "X / Twitter" },
  { key: "reddit", cls: "reddit", title: "Reddit" },
  { key: "bluesky", cls: "bsky", title: "Bluesky" },
  { key: "devto", cls: "devto", title: "Dev.to" },
  { key: "producthunt", cls: "ph", title: "Product Hunt" },
  { key: "huggingface", cls: "hf", title: "Hugging Face" },
  { key: "arxiv", cls: "arxiv", title: "arXiv" },
  { key: "npm", cls: "npm", title: "npm" },
  { key: "lobsters", cls: "lobsters", title: "Lobsters" },
];

const PIPS_VISIBLE = 6;
const CELL_VISIBLE = 4;

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
  const active = CHANNELS
    .map((ch) => ({ ...ch, n: sourceCount(rollup, ch.key) }))
    .filter((ch) => ch.n > 0);

  if (active.length === 0) return null;

  const visible = active.slice(0, PIPS_VISIBLE);
  const overflow = active.length - visible.length;
  const total = repo.mentions?.total ?? repo.mentions?.total24h ?? 0;

  return (
    <div className="source-pips">
      {visible.map(({ key, cls, title, n }) => (
        <span
          key={key}
          className={`spip ${cls}`}
          title={`${title} · ${n}`}
          aria-label={`${title}: ${n} mentions`}
        >
          <SourceLogo source={cls} />
        </span>
      ))}
      {overflow > 0 && (
        <span className="spip-more" title={`${overflow} more`}>+{overflow}</span>
      )}
      {total > 0 && <span className="spip-count">{total.toLocaleString()}</span>}
    </div>
  );
}

interface MentionCellProps {
  repo: Pick<Repo, "mentions" | "mentionCount24h">;
}

/** Combined Mentions cell — pips + count. Replaces V4 dual-column pattern. */
export function MentionCell({ repo }: MentionCellProps) {
  const rollup = repo.mentions?.perSource;
  const active = CHANNELS.filter(({ key }) => sourceCount(rollup, key) > 0);
  const count =
    repo.mentions?.total ??
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    0;
  const visible = active.slice(0, CELL_VISIBLE);
  const overflow = active.length - visible.length;
  const top = active[0];

  // Active-only: show ONLY sources with count > 0. Inactive sources DO NOT render.
  if (count === 0 && active.length === 0) {
    return (
      <div className="mention-pack mention-pack-empty">
        <span className="mp-empty" aria-label="No mentions">—</span>
      </div>
    );
  }

  return (
    <div className="mention-pack">
      <span className="ms-pips">
        {visible.map(({ key, cls, title }) => {
          const n = sourceCount(rollup, key);
          return (
            <span
              key={cls}
              className={`smark ${cls}`}
              title={`${title} · ${n}`}
              aria-label={`${title}: ${n} mentions`}
            >
              <SourceLogo source={cls} />
            </span>
          );
        })}
        {overflow > 0 && (
          <span className="ms-more" title={`${overflow} more`}>+{overflow}</span>
        )}
      </span>
      <span className="ms-count">{count.toLocaleString()}</span>
      {top && <span className="ms-top">live on {top.title}</span>}
    </div>
  );
}

/**
 * SourceLogo — inline SVG brand marks for each mention source.
 * Hand-crafted geometry-only marks (no <text>, no external dependencies,
 * no image files). Each mark is sized via the parent .smark / .spip element
 * (CSS controls width/height); the SVG fills 100% of the container.
 */
function SourceLogo({ source }: { source: string }) {
  switch (source) {
    case "github":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.77-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
        </svg>
      );
    case "hn":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect width="16" height="16" fill="currentColor" rx="1" />
          <path d="M8 8.6L5.5 4h1.4L8 6.6 9.1 4h1.4L8 8.6V12H7.6V8.6z" fill="#fff" stroke="#fff" strokeWidth="0.3" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M11.3 1.5h2.2l-4.7 5.4 5.5 7.6h-4.3L6.6 9.1l-3.9 4.4H.6l5-5.7L.4 1.5h4.4l3 4.1 3.5-4.1zm-.8 11.6h1.2L4.8 2.8H3.5l7 10.3z" />
        </svg>
      );
    case "reddit":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8.6" r="6.2" fill="currentColor" />
          <circle cx="5.6" cy="8.4" r="1.05" fill="#fff" />
          <circle cx="10.4" cy="8.4" r="1.05" fill="#fff" />
          <circle cx="5.8" cy="8.5" r="0.45" fill="#1a1a1b" />
          <circle cx="10.2" cy="8.5" r="0.45" fill="#1a1a1b" />
          <path
            d="M5.4 10.6c0.7 0.85 1.7 1.25 2.6 1.25s1.9-0.4 2.6-1.25"
            stroke="#fff"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="11.6" cy="4.8" r="1" fill="#fff" />
          <path d="M11.1 5.4L8.6 7" stroke="#fff" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          <circle cx="8.5" cy="7.1" r="0.55" fill="#fff" />
        </svg>
      );
    case "bsky":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M4.2 2.5c1.4 0 3.2 2 3.8 4.4 0.6-2.4 2.4-4.4 3.8-4.4 1.4 0 1.8 1 1.8 2.4 0 1.5-0.7 5.4-1.3 6.1-0.6 0.7-1.7 0.4-3 -0.4 1.4 0.9 1.8 2.4 1.1 3.2-0.7 0.7-1.5 0.1-2.4-1-0.9 1.1-1.7 1.7-2.4 1-0.7-0.8-0.3-2.3 1.1-3.2-1.3 0.8-2.4 1.1-3 0.4-0.6-0.7-1.3-4.6-1.3-6.1 0-1.4 0.4-2.4 1.8-2.4z"
            fill="currentColor"
          />
        </svg>
      );
    case "devto":
      // Geometry-only DEV mark: black background + 3 white letterforms (D, E, V) as paths.
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect width="16" height="16" fill="#0a0a0a" rx="1.5" />
          {/* D: vertical stroke + half-ellipse */}
          <path
            d="M2.4 5v6M2.4 5h1.4a1.6 2.4 0 0 1 0 6H2.4"
            stroke="#fff"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* E: vertical + 3 horizontal stubs */}
          <path
            d="M6.2 5v6M6.2 5h2M6.2 8h1.7M6.2 11h2"
            stroke="#fff"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* V: two angled strokes */}
          <path
            d="M9.6 5l1.7 6 1.7-6"
            stroke="#fff"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "ph":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M6.5 4.5h2.8c1.4 0 2.4 1 2.4 2.4s-1 2.4-2.4 2.4H7.5v2.2H6.5V4.5zM7.5 6v2H9c0.6 0 1.1-0.4 1.1-1S9.6 6 9 6H7.5z" fill="#fff" />
        </svg>
      );
    case "hf":
      // Recognizable HF smile + ear muffs at brighter yellow.
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <ellipse cx="3.2" cy="9.6" rx="1.4" ry="1.6" fill="#ffb74d" />
          <ellipse cx="12.8" cy="9.6" rx="1.4" ry="1.6" fill="#ffb74d" />
          <circle cx="8" cy="9" r="5.8" fill="currentColor" />
          <circle cx="5.7" cy="8.2" r="0.95" fill="#1a1a1a" />
          <circle cx="10.3" cy="8.2" r="0.95" fill="#1a1a1a" />
          <circle cx="5.85" cy="8.35" r="0.3" fill="#fff" />
          <circle cx="10.45" cy="8.35" r="0.3" fill="#fff" />
          <path
            d="M5.2 10.6c0.9 1.2 4.7 1.2 5.6 0"
            stroke="#1a1a1a"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "arxiv":
      // Geometry-only: deep-red square + white crossing strokes evoking chi.
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect width="16" height="16" fill="currentColor" rx="1.5" />
          <path
            d="M5 5L11 11M11 5L5 11"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "npm":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect width="16" height="16" fill="currentColor" rx="1" />
          <rect x="2" y="6" width="3" height="5" fill="#fff" />
          <rect x="3" y="7" width="1" height="3" fill="currentColor" />
          <rect x="6" y="6" width="3" height="5" fill="#fff" />
          <rect x="7" y="7" width="1" height="2" fill="currentColor" />
          <rect x="10" y="6" width="4" height="5" fill="#fff" />
          <rect x="11" y="7" width="1" height="3" fill="currentColor" />
          <rect x="13" y="7" width="1" height="3" fill="currentColor" />
        </svg>
      );
    case "lobsters":
      // Geometry-only: deep-red square + white "L" as two strokes.
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect width="16" height="16" fill="currentColor" rx="1.5" />
          <path
            d="M5 4v8h6"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
