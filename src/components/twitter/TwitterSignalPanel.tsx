import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { TwitterRepoPanel } from "@/lib/twitter/types";
import { XSignalBadge } from "./XSignalBadge";

interface TwitterSignalPanelProps {
  panel: TwitterRepoPanel;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        borderRadius: 2,
        padding: "12px 12px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--v4-ink-300)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
          fontWeight: 600,
          color: "var(--v4-ink-100)",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "var(--v4-ink-300)",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function TwitterSignalPanel({ panel }: TwitterSignalPanelProps) {
  return (
    <section
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <span
          className="flex-1 truncate"
          style={{
            color: "var(--v4-ink-200)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// X · SIGNAL · 24H"}
        </span>
        <span
          className="shrink-0"
          style={{
            color: "var(--v4-ink-300)",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          REFRESHED {getRelativeTime(panel.summary.lastScannedAt).toUpperCase()}
        </span>
      </div>

      <div className="p-4">
        <header className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <XSignalBadge badge={panel.rowBadge} />
            <p
              style={{
                fontSize: 13,
                color: "var(--v4-ink-300)",
              }}
            >
              Ranked confirmation layer for repo-specific X buzz in the last
              24h.
            </p>
          </div>
        </header>

      <div className="x-signal-stats">
        <Stat
          label="Mentions 24h"
          value={formatNumber(panel.summary.mentionCount24h)}
        />
        <Stat
          label="Authors 24h"
          value={formatNumber(panel.summary.uniqueAuthors24h)}
        />
        <Stat
          label="Engagement"
          value={formatNumber(panel.summary.engagementTotal24h)}
        />
        <Stat
          label="Peak hour"
          value={
            panel.summary.peakHour24h
              ? new Date(panel.summary.peakHour24h)
                  .toISOString()
                  .slice(11, 16)
              : "—"
          }
        />
        <Stat
          label="Score"
          value={panel.summary.finalTwitterScore.toFixed(1)}
          hint={panel.rowBadge.tooltip}
        />
      </div>

      <div className="x-signal-body">
        <div>
          <div
            className="mb-2"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--v4-ink-300)",
            }}
          >
            Top matched posts
          </div>
          {panel.topPosts.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--v4-line-200)",
                background: "var(--v4-bg-050)",
                borderRadius: 2,
                padding: "20px 16px",
                fontSize: 14,
                color: "var(--v4-ink-300)",
              }}
            >
              No high-signal X matches were stored for the latest scan.
            </div>
          ) : (
            <ul
              style={{
                border: "1px solid var(--v4-line-200)",
                background: "var(--v4-bg-050)",
                borderRadius: 2,
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {panel.topPosts.map((post, idx) => (
                <li
                  key={post.postId}
                  style={{
                    padding: "12px 16px",
                    borderTop:
                      idx === 0 ? "none" : "1px solid var(--v4-line-200)",
                  }}
                >
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 12,
                          color: "var(--v4-ink-200)",
                        }}
                      >
                        @{post.authorHandle}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 11,
                          color: "var(--v4-ink-300)",
                        }}
                      >
                        {formatNumber(post.engagement)} eng
                      </span>
                    </div>
                    <p
                      className="mt-1 group-hover:text-brand transition-colors"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: "var(--v4-ink-100)",
                      }}
                    >
                      {post.text}
                    </p>
                    <div
                      className="mt-2 flex items-center gap-3 flex-wrap"
                      style={{
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 11,
                        color: "var(--v4-ink-300)",
                      }}
                    >
                      <span>{post.confidence}</span>
                      <span>{post.matchedBy}</span>
                      <span>{getRelativeTime(post.postedAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        open <ExternalLink size={10} aria-hidden />
                      </span>
                    </div>
                    <p
                      className="mt-1"
                      style={{ fontSize: 11, color: "var(--v4-ink-300)" }}
                    >
                      {post.whyMatched}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside
          style={{
            border: "1px solid var(--v4-line-200)",
            background: "var(--v4-bg-050)",
            borderRadius: 2,
            padding: "16px 16px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--v4-ink-300)",
            }}
          >
            Confidence summary
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>High</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.highCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Medium</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.mediumCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Low</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.lowCount}
              </dd>
            </div>
            <div className="divider-dashed my-2" />
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Confidence ratio</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.confidenceRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Exact match ratio</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.exactMatchRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Author diversity</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.authorDiversityRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--v4-ink-300)" }}>Dominant author share</dt>
              <dd
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-100)",
                }}
              >
                {panel.confidenceSummary.dominantAuthorShare.toFixed(1)}
              </dd>
            </div>
          </dl>

          {panel.summary.topPostUrl ? (
            <Link
              href={panel.summary.topPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 transition-colors"
              style={{
                fontSize: 14,
                color: "var(--v4-acc)",
              }}
            >
              Top post
              <ExternalLink size={12} aria-hidden />
            </Link>
          ) : null}
        </aside>
      </div>
      </div>
    </section>
  );
}

export default TwitterSignalPanel;
