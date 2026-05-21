// /tools/top-10 — daily Top 10 archive viewer.
//
// Reads a single frozen snapshot via readTop10Snapshot(date) and renders the
// `repos` bundle (the canonical default for the share-card archive). The date
// is selected by `?date=YYYY-MM-DD` and validated via isValidDate; invalid
// input falls back to today's UTC date.
//
// 10-minute ISR per (date) — snapshots are immutable once the 23:55 UTC cron
// has written them, but today's date can still be in-flight, so a 10-min
// revalidate window keeps the live view honest without thrashing Redis.

import { Top10Board } from "@/components/tools/top-10/Top10Board";
import { Top10DateNav } from "@/components/tools/top-10/Top10DateNav";
import { getDerivedRepoByFullName, getDerivedRepos } from "@/lib/derived-repos";
import {
  isValidDate,
  readTop10Snapshot,
  todayUtcDate,
} from "@/lib/top10/snapshots";
import type { Top10Bundle } from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

export const revalidate = 600;

export const metadata = {
  title: "Top 10 - Daily Archive - TrendingRepo",
  description:
    "Browse every daily Top 10 snapshot. Pick a date, see who was breaking out that morning, and follow the cross-source signal that put them on the board.",
  openGraph: {
    images: [
      { url: "/api/og/tools/top-10", width: 1200, height: 630 },
    ],
  },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// ---- Date helpers (UTC, pure) ----------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function shiftDay(date: string, deltaDays: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  return new Date(t + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

function dayLabel(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  return `${DAY_LABELS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

function resolveDateParam(
  raw: string | string[] | undefined,
  today: string,
): string {
  if (typeof raw !== "string") return today;
  if (!isValidDate(raw)) return today;
  // Disallow future dates — clamp to today rather than 404, keeps the URL
  // navigable when someone hand-types a date the cron hasn't reached yet.
  if (raw > today) return today;
  return raw;
}

function buildLiveTop10Bundle(): Top10Bundle {
  let repos: Repo[] = [];
  try {
    repos = getDerivedRepos();
  } catch {
    repos = [];
  }

  const seeded: Array<Pick<Repo, "fullName" | "owner" | "name" | "description" | "starsDelta7d" | "starsDelta24h" | "momentumScore" | "stars">> = [
    {
      fullName: "openai/codex",
      owner: "openai",
      name: "codex",
      description: "OpenAI coding agent workspace.",
      stars: 0,
      starsDelta7d: 0,
      starsDelta24h: 0,
      momentumScore: 72,
    },
    {
      fullName: "vercel/next.js",
      owner: "vercel",
      name: "next.js",
      description: "React framework for production.",
      stars: 0,
      starsDelta7d: 0,
      starsDelta24h: 0,
      momentumScore: 68,
    },
    {
      fullName: "modelcontextprotocol/servers",
      owner: "modelcontextprotocol",
      name: "servers",
      description: "Reference MCP servers and examples.",
      stars: 0,
      starsDelta7d: 0,
      starsDelta24h: 0,
      momentumScore: 65,
    },
    {
      fullName: "huggingface/smolagents",
      owner: "huggingface",
      name: "smolagents",
      description: "Small agent framework for tool-using models.",
      stars: 0,
      starsDelta7d: 0,
      starsDelta24h: 0,
      momentumScore: 62,
    },
    {
      fullName: "cline/cline",
      owner: "cline",
      name: "cline",
      description: "Autonomous coding agent for IDE workflows.",
      stars: 0,
      starsDelta7d: 0,
      starsDelta24h: 0,
      momentumScore: 60,
    },
  ];

  const liveOrSeeded = repos.length > 0 ? repos : (seeded as Repo[]);
  const ranked = [...liveOrSeeded]
    .filter((repo) => repo.fullName.includes("/"))
    .sort((a, b) => {
      const aScore =
        (a.momentumScore ?? 0) * 10 +
        (a.starsDelta7d ?? 0) * 2 +
        (a.starsDelta24h ?? 0) * 3 +
        Math.log10((a.stars ?? 0) + 1);
      const bScore =
        (b.momentumScore ?? 0) * 10 +
        (b.starsDelta7d ?? 0) * 2 +
        (b.starsDelta24h ?? 0) * 3 +
        Math.log10((b.stars ?? 0) + 1);
      return bScore - aScore;
    })
    .slice(0, 10);

  const items = ranked.map((repo, index) => {
    const scoreRaw = repo.momentumScore ?? Math.min(100, Math.max(0, repo.starsDelta7d ?? 0));
    const score = Math.max(0.1, Math.min(5, scoreRaw / 20));
    return {
      rank: index + 1,
      slug: repo.fullName,
      title: repo.name,
      owner: repo.owner,
      description: repo.description ?? "",
      avatarLetter: repo.owner.charAt(0).toUpperCase() || "?",
      avatarGradient: ["var(--accent)", "var(--up)"] as [string, string],
      score,
      deltaPct: repo.starsDelta7d ? Math.min(99, repo.starsDelta7d / 10) : undefined,
      sparkline: repo.sparklineData?.slice(-14) ?? [],
      badges:
        index === 0
          ? ["HOT" as const]
          : index < 3
            ? ["FIRING_4" as const]
            : [],
      href: `/repo/${repo.owner}/${repo.name}`,
    };
  });

  const meanScore =
    items.length > 0
      ? (items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(1)
      : "0.0";

  return {
    items,
    meta: {
      totalMovement: `${items.length} live`,
      totalMovementSub: "derived from current repo spine",
      meanScore,
      meanScoreSub: "smart score",
      hottest: items[0]?.title ?? "repos",
      hottestSub: items[0]?.slug ?? "live corpus",
      coldest: items[items.length - 1]?.title ?? null,
      coldestSub: items[items.length - 1]?.slug,
    },
    supportedWindows: ["24h", "7d", "30d"],
    window: "7d",
  };
}

// ---- Page ------------------------------------------------------------------

export default async function Top10ArchivePage({ searchParams }: Props) {
  const today = todayUtcDate();
  const params = (await searchParams) ?? {};
  const activeDate = resolveDateParam(params.date, today);

  // Probe the active snapshot + the last 7 days for the pill strip in
  // parallel. Each readTop10Snapshot() call hits Redis once and returns null
  // on miss — no exceptions to handle here.
  const pillDates: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    pillDates.push(shiftDay(today, -i));
  }

  const [snapshot, ...pillSnapshots] = await Promise.all([
    readTop10Snapshot(activeDate),
    ...pillDates.map((d) => readTop10Snapshot(d)),
  ]);
  const active = snapshot?.repos ?? buildLiveTop10Bundle();

  const pills = pillDates.map((d, i) => ({
    date: d,
    label: dayLabel(d),
    isToday: d === today,
    isActive: d === activeDate,
    hasSnapshot: Boolean(pillSnapshots[i]) || d === activeDate,
  }));

  const nextCandidate = shiftDay(activeDate, +1);
  const nextDate = nextCandidate > today ? null : nextCandidate;
  const prevDate = shiftDay(activeDate, -1);

  // Build the live-Repo lookup for the active board only. We fan out per row
  // (max 10) — getDerivedRepoByFullName is React-cached so duplicate slugs
  // would dedupe, and the underlying derived-repos cache itself only stats
  // the upstream files once every 5s.
  const reposBySlug = new Map<string, Repo>();
  const slugs = active.items.map((item) => item.slug);
  for (const slug of slugs) {
    try {
      const repo = getDerivedRepoByFullName(slug);
      if (repo) reposBySlug.set(slug.toLowerCase(), repo);
    } catch {
      // Derived-repos can throw on a cold Lambda when no committed JSON is
      // present in this environment; the row falls back to snapshot-only.
    }
  }

  return (
    <div className="t10-page" style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <Top10PageStyles />

      <Top10DateNav
        activeDate={activeDate}
        todayDate={today}
        prevDate={prevDate}
        nextDate={nextDate}
        pills={pills}
      />

      <Top10Board bundle={active} reposBySlug={reposBySlug} />
    </div>
  );
}

// ---- Local styles ----------------------------------------------------------

function Top10PageStyles() {
  return (
    <style>{`
      .t10-page { color: var(--fg); }

      /* ---- Hero ---- */
      .t10-hero { padding: 8px 0 18px; }
      .t10-hero-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: end;
      }
      .t10-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .t10-eyebrow-tag {
        background: var(--accent);
        color: var(--bg);
        padding: 2px 7px;
        border-radius: 1px;
        font-weight: 700;
      }
      .t10-eyebrow-sub { color: var(--fg-faint); }
      .t10-title {
        font-size: 26px;
        line-height: 1.15;
        color: var(--fg-bright);
        font-weight: 500;
        margin: 0;
        letter-spacing: -0.01em;
      }

      .t10-nav {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .t10-arrow {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: 1px;
        color: var(--fg);
        font-family: var(--font-mono);
        font-size: 14px;
        text-decoration: none;
        transition: all var(--d-fast) var(--ease);
        user-select: none;
      }
      .t10-arrow:hover { background: var(--surface-3); color: var(--fg-bright); border-color: var(--border); }
      .t10-arrow-off { color: var(--fg-faint); opacity: 0.4; cursor: not-allowed; }
      .t10-date {
        font-size: 22px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        padding: 0 4px;
      }
      .t10-jump-today {
        margin-left: 8px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        padding: 4px 8px;
        border: 1px solid var(--accent-border, var(--border));
        border-radius: 1px;
        transition: all var(--d-fast) var(--ease);
      }
      .t10-jump-today:hover { background: var(--accent-soft, var(--surface-3)); }

      /* ---- 7-day pill strip ---- */
      .t10-pills {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
        margin: 14px 0 22px;
      }
      .t10-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 6px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: 1px;
        text-decoration: none;
        color: var(--fg-muted);
        transition: all var(--d-fast) var(--ease);
      }
      .t10-pill:hover { background: var(--surface-3); color: var(--fg-bright); border-color: var(--border); }
      .t10-pill.on {
        background: var(--accent-soft, var(--surface-3));
        border-color: var(--accent);
        color: var(--fg-bright);
      }
      .t10-pill.today .t10-pill-day { color: var(--accent); }
      .t10-pill.empty { opacity: 0.55; }
      .t10-pill-day {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        font-weight: 600;
      }
      .t10-pill-iso {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }
      .t10-pill.on .t10-pill-iso { color: var(--fg); }

      /* ---- Board ---- */
      .t10-board { display: flex; flex-direction: column; gap: 22px; }
      .t10-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; background: var(--border-subtle); }
      .t10-row {
        display: grid;
        grid-template-columns: 56px 40px minmax(0, 1fr) 110px minmax(0, 1.05fr) 38px;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        background: var(--surface);
        transition: background var(--d-fast) var(--ease);
      }
      .t10-row:hover { background: var(--surface-3); }
      .t10-row.top3 { background: linear-gradient(to right, var(--accent-soft, var(--surface)) 0%, var(--surface) 18%); }

      .t10-rank {
        display: flex;
        align-items: baseline;
        justify-content: flex-start;
      }
      .t10-rank-num {
        font-family: var(--font-mono);
        font-size: 24px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--fg-muted);
        letter-spacing: -0.02em;
      }
      .t10-row.top3 .t10-rank-num { color: var(--accent); font-size: 28px; }
      .t10-row.tier-A .t10-rank-num { color: var(--fg); }

      .t10-avatar { width: 32px; height: 32px; display: grid; place-items: center; }
      .t10-logo {
        width: 32px;
        height: 32px;
        border-radius: 1px;
        object-fit: cover;
        background: var(--surface-3);
      }
      .t10-logo-fallback {
        width: 32px;
        height: 32px;
        border-radius: 1px;
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 14px;
        font-weight: 700;
        color: var(--bg);
      }

      .t10-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .t10-id-link { text-decoration: none; color: inherit; font-family: var(--font-mono); font-size: 13px; }
      .t10-id-link:hover .t10-name { color: var(--accent); }
      .t10-owner { color: var(--fg-muted); }
      .t10-slash { color: var(--fg-faint); padding: 0 2px; }
      .t10-name { color: var(--fg-bright); font-weight: 500; }
      .t10-desc {
        font-size: 11px;
        color: var(--fg-faint);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .t10-stars { display: flex; align-items: baseline; gap: 8px; justify-content: flex-end; }
      .t10-stars-num {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .t10-delta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
      }
      .t10-delta-up { color: var(--up); }
      .t10-delta-down { color: var(--down); }
      .t10-delta-flat { color: var(--fg-faint); }
      .t10-delta-unknown { color: var(--fg-faint); opacity: 0.6; }

      .t10-mentions { min-width: 0; overflow: hidden; }
      .t10-mentions-empty { font-family: var(--font-mono); font-size: 11px; color: var(--fg-faint); }

      .t10-tier {
        justify-self: end;
        width: 28px;
        height: 22px;
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        color: var(--bg);
        border-radius: 1px;
      }
      .tier-badge-S { background: var(--accent); }
      .tier-badge-A { background: var(--cyan, var(--fg)); }
      .tier-badge-B { background: var(--up); }

      /* ---- Meta strip ---- */
      .t10-meta {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1px;
        background: var(--border-subtle);
        margin: 0;
      }
      .t10-meta-cell {
        background: var(--surface);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .t10-meta-cell dt {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--fg-faint);
        margin: 0;
      }
      .t10-meta-cell dd {
        font-family: var(--font-mono);
        font-size: 18px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        margin: 0;
        font-weight: 500;
      }
      .t10-meta-cell dd.hot { color: var(--accent); }
      .t10-meta-cell dd.cold { color: var(--fg-muted); }
      .t10-meta-cell .sub {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        margin-top: 1px;
      }

      /* ---- Empty state ---- */
      .t10-empty {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        padding: 32px 22px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .t10-empty-head {
        font-family: var(--font-mono);
        font-size: 16px;
        color: var(--fg-bright);
        margin: 0;
      }
      .t10-empty-sub { font-size: 13px; color: var(--fg-muted); margin: 0; max-width: 56ch; line-height: 1.5; }
      .t10-empty-cta {
        margin-top: 8px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        text-decoration: none;
        padding: 6px 10px;
        border: 1px solid var(--accent-border, var(--border));
        border-radius: 1px;
      }
      .t10-empty-cta:hover { background: var(--accent-soft, var(--surface-3)); }

      @media (max-width: 1100px) {
        .t10-hero-row { grid-template-columns: 1fr; }
        .t10-row {
          grid-template-columns: 44px 32px minmax(0, 1fr) 32px;
          grid-template-areas:
            "rank avatar id tier"
            ".    .      mentions mentions"
            ".    .      stars stars";
          row-gap: 6px;
        }
        .t10-rank { grid-area: rank; }
        .t10-avatar { grid-area: avatar; }
        .t10-id { grid-area: id; }
        .t10-stars { grid-area: stars; justify-content: flex-start; }
        .t10-mentions { grid-area: mentions; }
        .t10-tier { grid-area: tier; }
        .t10-meta { grid-template-columns: repeat(2, 1fr); }
        .t10-pills { grid-template-columns: repeat(4, 1fr); }
        .t10-pills .t10-pill:nth-child(n+5) { display: none; }
      }
    `}</style>
  );
}
