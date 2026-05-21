// LabsAnnouncementsFeed — combined OpenAI + Anthropic announcement stream.
//
// Reads the in-memory RSS caches populated by refreshClaudeRssFromStore() +
// refreshOpenaiRssFromStore() on the calling page. The caller MUST await
// those refresh hooks before rendering — same pattern as ArxivPapersTable
// being preceded by refreshArxivFromStore() in /market-signals.
//
// Both feeds are merged + sorted by publishedAt desc. When both feeds are
// empty (flags off, no Redis seed) the card surfaces a FreshnessPill in
// STALE state rather than showing fabricated rows.

import {
  getClaudeRssTop,
  getOpenaiRssTop,
  claudeFetchedAt,
  openaiFetchedAt,
  type RssItem,
} from "@/lib/rss-feeds";

interface LabsAnnouncementsFeedProps {
  limit?: number;
}

function relAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function newestFetched(): string | null {
  const c = claudeFetchedAt();
  const o = openaiFetchedAt();
  if (!c) return o;
  if (!o) return c;
  return Date.parse(c) >= Date.parse(o) ? c : o;
}

function labelFor(source: RssItem["source"]): string {
  return source === "openai" ? "OPENAI" : "ANTHROPIC";
}

function dotClassFor(source: RssItem["source"]): string {
  return source === "openai" ? "src-dot src-openai" : "src-dot src-anthropic";
}

export function LabsAnnouncementsFeed({ limit = 8 }: LabsAnnouncementsFeedProps) {
  const merged: RssItem[] = [...getOpenaiRssTop(50), ...getClaudeRssTop(50)];
  merged.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  const rows = merged.slice(0, limit);
  const fetchedAt = newestFetched();
  const isCold = rows.length === 0 || !fetchedAt;

  return (
    <div className="card lab-feed">
      <div className="card-head">
        <h2 className="card-title">
          <b>Lab announcements</b> — OpenAI + Anthropic
        </h2>
        <span className="grow" />
        {isCold ? (
          <span className="fresh fresh-cold">
            <span className="pip" /> COLD · no upstream
          </span>
        ) : (
          <span className="chip info">{rows.length} recent</span>
        )}
      </div>

      <div>
        {rows.length === 0 ? (
          <div
            className="muted"
            style={{ padding: "18px 16px", fontSize: 12 }}
          >
            No lab announcements indexed yet. When TOOLBOX feeds are wired
            (TOOLBOX_READ_CLAUDE_RSS / TOOLBOX_READ_OPENAI_ANNOUNCEMENTS) the
            latest posts from OpenAI + Anthropic land here.
          </div>
        ) : (
          rows.map((item) => (
            <a
              key={`${item.source}-${item.id}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lab-row"
            >
              <span className={dotClassFor(item.source)} aria-hidden="true" />
              <span className="lab-src">{labelFor(item.source)}</span>
              <span className="lab-title">{item.title}</span>
              <span className="lab-age">{relAge(item.publishedAt)}</span>
            </a>
          ))
        )}
      </div>

      <style>{`
        .lab-feed .lab-row {
          display: grid;
          grid-template-columns: 10px 70px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 9px 16px;
          border-bottom: 1px solid var(--border-subtle);
          text-decoration: none;
          color: var(--fg);
          transition: background var(--d-fast) var(--ease);
        }
        .lab-feed .lab-row:last-child { border-bottom: 0; }
        .lab-feed .lab-row:hover { background: var(--surface-2); }
        .lab-feed .src-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .lab-feed .src-openai { background: #10a37f; }
        .lab-feed .src-anthropic { background: #d97757; }
        .lab-feed .lab-src {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--fg-faint);
          text-transform: uppercase;
        }
        .lab-feed .lab-title {
          font-size: 13px;
          color: var(--fg-bright);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lab-feed .lab-age {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--fg-faint);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
