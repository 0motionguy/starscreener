// Featured news cards — 3 editorial picks shown directly under the hero
// charts. Sits between the hero and the table on every news page.
//
// Each card: terminal-bar header (source pill + label) + bold headline +
// 2-3 line excerpt + footer meta (author / mentions / score / age).
// No images / no SVG art — text-first cards.
//
// Demo only.

import Link from "next/link";
import { ArrowUpRight, MessagesSquare, Star } from "lucide-react";

import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";

export interface FeaturedItem {
  id: string;
  source: string;       // pill code (HN / L / D / B / R / CC / CX / PP)
  sourceLabel: string;  // pill long label
  sourceColor: string;  // pill color (rgba)
  title: string;
  excerpt: string;
  author: string;
  score: number;
  mentions: number;
  age: string;
}

interface FeaturedCardsV2Props {
  items: FeaturedItem[];
}

export function FeaturedCardsV2({ items }: FeaturedCardsV2Props) {
  if (items.length === 0) return null;
  return (
    <section className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame py-6">
        {/* Single small mono label — no big section title, no description.
            The cards immediately follow. */}
        <p className="v2-mono mb-3" style={{ color: "var(--v2-ink-300)" }}>
          <span aria-hidden>{"// "}</span>
          FEATURED · TODAY · 3 PICKS
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {items.slice(0, 3).map((item, i) => (
            <FeaturedCard key={item.id} item={item} featured={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Single editorial card — text-only, no hero image
// ---------------------------------------------------------------------------

function FeaturedCard({
  item,
  featured,
}: {
  item: FeaturedItem;
  featured: boolean;
}) {
  return (
    <Link
      href="#"
      className={`v2-card v2-card-hover overflow-hidden block group relative flex flex-col ${featured ? "v2-bracket" : ""}`}
    >
      {featured ? <BracketMarkers /> : null}

      <TerminalBar
        label={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5"
              style={{ background: item.sourceColor, borderRadius: 1 }}
            />
            <span style={{ color: "var(--v2-ink-200)" }}>{item.source}</span>
            <span style={{ color: "var(--v2-ink-500)" }}>·</span>
            <span style={{ color: "var(--v2-ink-300)" }}>
              {item.sourceLabel}
            </span>
          </span>
        }
        status={
          featured ? (
            <span style={{ color: "var(--v2-acc)" }}>FEATURED</span>
          ) : null
        }
      />

      <div className="p-5 flex flex-col gap-3 flex-1">
        <h3
          className="line-clamp-4"
          style={{
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontWeight: 510,
            fontSize: 19,
            lineHeight: 1.25,
            letterSpacing: "-0.012em",
            color: "var(--v2-ink-000)",
          }}
        >
          {item.title}
        </h3>
        <p
          className="line-clamp-3 text-[13px] leading-relaxed"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {item.excerpt}
        </p>

        {/* Footer meta — author · mentions · score · age */}
        <div
          className="mt-auto pt-3 flex items-center gap-3 v2-mono"
          style={{ borderTop: "1px dashed var(--v2-line-200)" }}
        >
          <span style={{ color: "var(--v2-ink-200)" }}>@{item.author}</span>
          <span aria-hidden style={{ color: "var(--v2-line-300)" }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <MessagesSquare className="size-3 shrink-0" aria-hidden />
            <span className="tabular-nums">{item.mentions}</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            style={{ color: "var(--v2-acc)" }}
          >
            <Star className="size-3 shrink-0" aria-hidden />
            <span className="tabular-nums">
              {item.score.toLocaleString("en-US")}
            </span>
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span className="tabular-nums">{item.age}</span>
            <ArrowUpRight
              className="size-3 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              style={{ color: "var(--v2-acc)" }}
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
