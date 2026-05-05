"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getRelativeTime } from "@/lib/utils";
import {
  MENTION_SOURCE_BADGE_TEXT,
  MENTION_SOURCE_COLORS,
  type MentionItem,
  toMentionItem,
} from "@/components/repo-detail/MentionMeta";
import type { RepoMention } from "@/lib/pipeline/types";

interface MentionsCardProps {
  owner: string;
  name: string;
  totalMentions: number;
  delta24h: number;
}

interface MentionsResponse {
  ok: boolean;
  items?: RepoMention[];
}

export function MentionsCard({
  owner,
  name,
  totalMentions,
  delta24h,
}: MentionsCardProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MentionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const href = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/mentions?limit=5`;
        const res = await fetch(href, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as MentionsResponse;
        const normalized = (data.items ?? [])
          .map(toMentionItem)
          .filter((item): item is MentionItem => item !== null)
          .slice(0, 5);
        if (!canceled) setRows(normalized);
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load mentions");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [owner, name]);

  const deltaLabel = useMemo(() => {
    if (delta24h === 0) return "flat vs prior 24h";
    return `${delta24h > 0 ? "+" : ""}${delta24h} vs prior 24h`;
  }, [delta24h]);

  return (
    <section className="v2-card overflow-hidden" aria-label="Mentions card">
      <div className="v2-term-bar">
        <span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
          {"// MENTIONS · TOP 5"}
        </span>
        <span className="v2-stat tabular-nums" style={{ color: "var(--v2-ink-300)" }}>
          {totalMentions.toLocaleString("en-US")} total
        </span>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-mono uppercase tracking-[0.12em] text-text-tertiary">
            {deltaLabel}
          </p>
          <Link
            href={`/repo/${owner}/${name}/mentions`}
            className="text-xs font-mono uppercase tracking-[0.12em] text-brand hover:underline"
          >
            See all
          </Link>
        </div>

        {loading ? <SkeletonRows /> : null}
        {!loading && error ? (
          <p className="text-sm text-text-tertiary">
            Mentions unavailable right now.
          </p>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            No mentions found yet.
          </p>
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: MENTION_SOURCE_COLORS[row.source] }}
                  aria-label={row.source}
                >
                  {MENTION_SOURCE_BADGE_TEXT[row.source]}
                </span>
                <div className="min-w-0">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-1 text-sm text-text-primary hover:text-brand"
                  >
                    {row.title}
                  </a>
                  <p className="text-xs text-text-tertiary">
                    {row.author} · {getRelativeTime(row.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function SkeletonRows() {
  return (
    <ul className="space-y-2" aria-label="Loading mentions">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-0.5 size-5 shrink-0 rounded bg-bg-tertiary" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-3 w-full rounded bg-bg-tertiary" />
            <div className="h-3 w-2/3 rounded bg-bg-tertiary" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default MentionsCard;
