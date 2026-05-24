// Top10SubBoards — 2x3 sub-leaderboard grid for /tools/top-10.
//
// Renders six smaller "Top 10" cards below the main board (LLMs / Agents /
// MCPs / Skills / Biggest jumps / News). Reads from the same Top10Payload —
// each bundle is already computed by the daily 23:55 UTC cron. Each card's
// "Open & share →" link switches the main board via ?cat=…, which the page
// reads to pick which bundle to render.
//
// Visual contract (docs/DESIGN-SYSTEM.md §7):
//   - .panel chrome (border-subtle, surface fill)
//   - Header uses .slash accent + uppercase mono caps
//   - Rows are .tdata-ish — mono tabular nums, hover state, deltaPct color
//   - "Open & share" footer uses var(--accent) with <Icon name="arrow-up-right" />

import Link from "next/link";

import { Icon } from "@/lib/icons";
import {
  CATEGORY_META,
  WINDOW_FRIENDLY_LABEL,
  type Top10Bundle,
  type Top10Category,
  type Top10Payload,
} from "@/lib/top10/types";

const DEFAULT_CATEGORIES: Top10Category[] = [
  "llms",
  "agents",
  "movers",
  "news",
];

const MAX_ROWS = 5;

interface Top10SubBoardsProps {
  payload: Top10Payload | null;
  activeDate: string;
  /** Override the default category set. */
  categories?: Top10Category[];
}

export function Top10SubBoards({
  payload,
  activeDate,
  categories = DEFAULT_CATEGORIES,
}: Top10SubBoardsProps) {
  return (
    <div className="t10-subgrid" aria-label="More Top 10 leaderboards">
      {categories.map((cat) => {
        const bundle = payload?.[cat];
        const meta = CATEGORY_META[cat];
        const window = bundle?.window ?? meta.defaultWindow;
        const items = bundle?.items?.slice(0, MAX_ROWS) ?? [];
        const href = `/tools/top-10?date=${activeDate}&cat=${cat}`;

        return (
          <article key={cat} className="t10-subcard">
            <header className="t10-subhead">
              <h3 className="t10-subtitle">
                <span className="slash">//</span> Top 10 · {meta.label}
              </h3>
              <span className="t10-subwindow">{WINDOW_FRIENDLY_LABEL[window]}</span>
            </header>

            {items.length === 0 ? (
              <div className="t10-subempty">No snapshot for this category yet.</div>
            ) : (
              <ol className="t10-sublist">
                {items.map((item) => (
                  <SubRow key={item.slug} item={item} />
                ))}
              </ol>
            )}

            <Link href={href} className="t10-subopen" prefetch={false}>
              <span>Open &amp; share</span>
              <Icon name="arrow-up-right" size="xs" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}

function SubRow({ item }: { item: Top10Bundle["items"][number] }) {
  const hasOwner = Boolean(item.owner) && item.slug.includes("/");
  const label = hasOwner ? null : truncate(item.title, 56);
  const deltaPct = item.deltaPct;
  const deltaText =
    typeof deltaPct === "number"
      ? `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}%`
      : null;
  const deltaCls =
    typeof deltaPct === "number"
      ? deltaPct > 0
        ? "up"
        : deltaPct < 0
          ? "dn"
          : "flat"
      : null;
  const scoreText = item.score ? item.score.toFixed(2) : null;

  return (
    <li className="t10-subrow">
      <Link href={item.href} className="t10-subrow-link" prefetch={false}>
        <span className="t10-subrank">{String(item.rank).padStart(2, "0")}</span>
        <span className="t10-subname">
          {hasOwner ? (
            <>
              <span className="owner">{item.owner}</span>
              <span className="slash">/</span>
              <span className="name">{item.title}</span>
            </>
          ) : (
            <span className="name">{label}</span>
          )}
        </span>
        {deltaText ? (
          <span className={`t10-subdelta ${deltaCls}`}>{deltaText}</span>
        ) : scoreText ? (
          <span className="t10-subscore">{scoreText}</span>
        ) : null}
      </Link>
    </li>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
