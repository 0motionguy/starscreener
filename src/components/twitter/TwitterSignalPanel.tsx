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
    <div className="rounded-md border border-border-primary bg-bg-secondary px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-text-primary">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary">{hint}</div>
      ) : null}
    </div>
  );
}

export function TwitterSignalPanel({ panel }: TwitterSignalPanelProps) {
  return (
    <section className="v2-card overflow-hidden">
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <span
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// X · SIGNAL · 24H"}
        </span>
        <span
          className="v2-stat shrink-0"
          style={{ color: "var(--v2-ink-300)" }}
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
                color: "var(--v2-ink-300)",
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
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Top matched posts
          </div>
          {panel.topPosts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 px-4 py-5 text-sm text-text-tertiary">
              No high-signal X matches were stored for the latest scan.
            </div>
          ) : (
            <ul className="divide-y divide-border-primary/40 rounded-md border border-border-primary bg-bg-secondary">
              {panel.topPosts.map((post) => (
                <li key={post.postId} className="px-4 py-3">
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-text-secondary">
                        @{post.authorHandle}
                      </span>
                      <span className="font-mono text-[11px] text-text-tertiary">
                        {formatNumber(post.engagement)} eng
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-primary leading-relaxed group-hover:text-brand transition-colors">
                      {post.text}
                    </p>
                    <div className="mt-2 flex items-center gap-3 flex-wrap font-mono text-[11px] text-text-tertiary">
                      <span>{post.confidence}</span>
                      <span>{post.matchedBy}</span>
                      <span>{getRelativeTime(post.postedAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        open <ExternalLink size={10} aria-hidden />
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      {post.whyMatched}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="rounded-md border border-border-primary bg-bg-secondary px-4 py-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Confidence summary
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">High</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.highCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Medium</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.mediumCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Low</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.lowCount}
              </dd>
            </div>
            <div className="divider-dashed my-2" />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Confidence ratio</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.confidenceRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Exact match ratio</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.exactMatchRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Author diversity</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.authorDiversityRatio.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">Dominant author share</dt>
              <dd className="font-mono text-text-primary">
                {panel.confidenceSummary.dominantAuthorShare.toFixed(1)}
              </dd>
            </div>
          </dl>

          {panel.summary.topPostUrl ? (
            <Link
              href={panel.summary.topPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm text-brand hover:text-brand/80 transition-colors"
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
