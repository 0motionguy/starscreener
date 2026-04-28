// "Talked about across N sources right now" — top of trending page.
//
// Reads the same Repo[] the rest of the page uses, picks the top by
// channelsFiring DESC then crossSignalScore DESC, renders one row per
// repo as a Node/01 instrument-panel "signal bar" with per-source
// mention chips and a tabular total.
//
// Server component — no fetching. Just renders what getDerivedRepos
// already computed via attachCrossSignal().

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface CrossSourceBuzzProps {
  repos: Repo[];
  /** How many to show. Default 10. */
  limit?: number;
  /** ISO timestamp of the last data refresh — used by the terminal bar. */
  lastFetchedAt?: string | number;
}

type ChannelKey = keyof NonNullable<Repo["channelStatus"]>;

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  github: "GH",
  reddit: "REDDIT",
  hn: "HN",
  bluesky: "BSKY",
  devto: "DEVTO",
};

const CHANNEL_HREF: Record<ChannelKey, string> = {
  github: "",
  reddit: "/reddit",
  hn: "/hackernews/trending",
  bluesky: "/bluesky/trending",
  devto: "/devto",
};

const CHANNEL_ORDER: ChannelKey[] = [
  "github",
  "reddit",
  "hn",
  "bluesky",
  "devto",
];

function formatAgo(ts?: string | number): string {
  if (ts === undefined) return "—";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "0s";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return `${Math.floor(diff / 1000)}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function CrossSourceBuzz({
  repos,
  limit = 10,
  lastFetchedAt,
}: CrossSourceBuzzProps) {
  const ranked = [...repos]
    .filter((r) => (r.channelsFiring ?? 0) >= 2)
    .sort((a, b) => {
      const fa = a.channelsFiring ?? 0;
      const fb = b.channelsFiring ?? 0;
      if (fb !== fa) return fb - fa;
      return (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0);
    })
    .slice(0, limit);

  if (ranked.length === 0) return null;

  const ago = formatAgo(lastFetchedAt);

  return (
    <section
      aria-label="Cross-source buzz"
      className="border-y"
      style={{
        borderColor: "var(--v2-line-100)",
        background: "var(--v2-bg-050)",
      }}
    >
      <div className="v2-frame mx-4 sm:mx-6 my-3 max-w-[1400px] xl:mx-auto overflow-hidden">
        {/* Terminal-bar header */}
        <div className="v2-term-bar flex items-center gap-3">
          <span aria-hidden className="flex items-center gap-1.5">
            <span className="v2-live-dot block" />
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
            <span aria-hidden>{"// "}</span>
            CROSS-SOURCE · BUZZ · 24H
          </span>
          <span
            className="v2-stat shrink-0 hidden sm:inline-flex items-center gap-1.5"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span style={{ color: "var(--v2-sig-green)" }}>LIVE</span>
            <span aria-hidden style={{ color: "var(--v2-line-300)" }}>
              ·
            </span>
            <span className="tabular-nums">T-{ago}</span>
          </span>
        </div>

        {/* Signal bars */}
        <ul role="list" className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {ranked.map((repo, idx) => {
            const isTop = idx === 0;
            const isBreakout =
              repo.movementStatus === "breakout" ||
              repo.movementStatus === "hot";
            const total = repo.channelsFiring ?? 0;
            const lit = CHANNEL_ORDER.filter(
              (k) => repo.channelStatus?.[k] === true,
            );
            const totalColor = isBreakout
              ? "var(--v2-acc)"
              : "var(--v2-ink-100)";

            return (
              <li
                key={repo.fullName}
                className={`v2-row ${isTop ? "v2-bracket" : ""}`.trim()}
                style={{
                  borderTopColor: "var(--v2-line-100)",
                  background: isTop ? "var(--v2-bg-000)" : "transparent",
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-3 py-2.5">
                  {/* Rank + repo name */}
                  <div className="flex items-baseline gap-3 min-w-0 md:flex-1">
                    <span
                      className="v2-stat shrink-0 tabular-nums text-[10px]"
                      style={{ color: "var(--v2-ink-400)" }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/repo/${repo.fullName}`}
                      className="v2-mono min-w-0 truncate text-[12px] transition-colors"
                      style={{ color: "var(--v2-ink-100)" }}
                      data-cs-buzz-link
                    >
                      {repo.fullName}
                    </Link>
                    <span
                      className="v2-stat shrink-0 hidden md:inline tabular-nums text-[10px]"
                      style={{ color: "var(--v2-ink-400)" }}
                    >
                      {(repo.starsDelta24h ?? 0) >= 0 ? "+" : ""}
                      {repo.starsDelta24h ?? 0}★ 24H
                    </span>
                  </div>

                  {/* Per-source chips */}
                  <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                    {lit.map((key) => {
                      const label = CHANNEL_LABEL[key];
                      const href = CHANNEL_HREF[key];
                      const count = repo.channelStatus?.[key] === true ? 1 : 0;
                      const chip = (
                        <span
                          className="v2-tag tabular-nums"
                          style={{
                            color: "var(--v2-ink-200)",
                            borderColor: "var(--v2-line-200)",
                          }}
                          title={`Live signal on ${key}`}
                        >
                          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>
                            [&nbsp;
                          </span>
                          <span style={{ color: "var(--v2-ink-100)" }}>
                            {label}
                          </span>
                          <span aria-hidden>&nbsp;</span>
                          <span style={{ color: "var(--v2-acc)" }}>
                            {count}
                          </span>
                          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>
                            &nbsp;]
                          </span>
                        </span>
                      );
                      return href ? (
                        <Link
                          key={key}
                          href={href}
                          aria-label={`Open ${key}`}
                          className="inline-flex"
                        >
                          {chip}
                        </Link>
                      ) : (
                        <span key={key}>{chip}</span>
                      );
                    })}

                    {/* Total mention count */}
                    <span
                      className="v2-stat shrink-0 ml-1 text-[12px] tabular-nums"
                      style={{ color: totalColor }}
                      aria-label={`${total} channels firing`}
                    >
                      ×{total}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Hover accent for repo links — scoped via data-attr to avoid touching globals. */}
      <style>{`
        [data-cs-buzz-link]:hover { color: var(--v2-acc) !important; }
      `}</style>
    </section>
  );
}

export default CrossSourceBuzz;
