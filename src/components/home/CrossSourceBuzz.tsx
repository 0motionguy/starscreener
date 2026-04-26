// "Talked about across N sources right now" — top of trending page.
//
// Reads the same Repo[] the rest of the page uses, picks the top by
// channelsFiring DESC then crossSignalScore DESC, renders one row per
// repo with 5 channel chips lit (GH/R/HN/BL/DT) per the precomputed
// Repo.channelStatus.
//
// Server component — no fetching. Just renders what getDerivedRepos
// already computed via attachCrossSignal().

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface CrossSourceBuzzProps {
  repos: Repo[];
  /** How many to show. Default 10. */
  limit?: number;
}

const CHANNEL_LABEL: Record<keyof NonNullable<Repo["channelStatus"]>, string> = {
  github: "GH",
  reddit: "R",
  hn: "HN",
  bluesky: "BL",
  devto: "DT",
};

const CHANNEL_HREF: Record<keyof NonNullable<Repo["channelStatus"]>, string> = {
  github: "",
  reddit: "/reddit",
  hn: "/hackernews/trending",
  bluesky: "/bluesky/trending",
  devto: "/devto",
};

export function CrossSourceBuzz({ repos, limit = 10 }: CrossSourceBuzzProps) {
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

  return (
    <section className="px-4 sm:px-6 py-3 border-y border-border-primary bg-bg-secondary/40">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            Cross-source buzz
          </h2>
          <span className="font-mono text-[10px] text-text-tertiary">
            {"// repos lit on ≥2 sources right now"}
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
          {ranked.map((repo) => (
            <li
              key={repo.fullName}
              className="flex items-center gap-3 rounded-md border border-border-primary bg-bg-card px-3 py-2"
            >
              <Link
                href={`/repo/${repo.fullName}`}
                className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-primary hover:underline"
              >
                {repo.fullName}
              </Link>
              <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
                {(repo.starsDelta24h ?? 0) >= 0 ? "+" : ""}
                {repo.starsDelta24h ?? 0}★ 24h
              </span>
              <div className="flex items-center gap-0.5">
                {(["github", "reddit", "hn", "bluesky", "devto"] as const).map(
                  (key) => {
                    const lit = repo.channelStatus?.[key] === true;
                    const label = CHANNEL_LABEL[key];
                    const href = CHANNEL_HREF[key];
                    const chip = (
                      <span
                        className={
                          "inline-flex h-5 min-w-[24px] items-center justify-center rounded-full border px-1.5 font-mono text-[9px] uppercase tracking-wider transition " +
                          (lit
                            ? "border-functional/60 bg-functional/10 text-functional"
                            : "border-border-primary bg-bg-muted text-text-tertiary opacity-40")
                        }
                        title={
                          lit
                            ? `Live signal on ${key}`
                            : `No signal on ${key}`
                        }
                      >
                        {label}
                      </span>
                    );
                    if (lit && href) {
                      return (
                        <Link key={key} href={href} aria-label={`Open ${key}`}>
                          {chip}
                        </Link>
                      );
                    }
                    return <span key={key}>{chip}</span>;
                  },
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default CrossSourceBuzz;
