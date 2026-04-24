// HomeCtaRow — compact nav row under the hero.
//
// Five high-intent destinations, rendered as terminal-pill links so a
// visitor can jump straight to the surface that matters to them (breakouts
// leaderboard, verified revenue, funding events, compare, or submit a repo)
// without scrolling through the full terminal. Pure server component — no
// client JS, no store dependencies, zero hydration cost.

import Link from "next/link";
import { ArrowRight, DollarSign, GitCompare, Send, TrendingUp, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CtaLink {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const LINKS: CtaLink[] = [
  {
    href: "/breakouts",
    label: "Breakouts",
    hint: "live velocity leaders",
    icon: Zap,
  },
  {
    href: "/revenue",
    label: "Revenue",
    hint: "verified MRR",
    icon: DollarSign,
  },
  {
    href: "/funding",
    label: "Funding",
    hint: "rounds · valuations",
    icon: TrendingUp,
  },
  {
    href: "/compare",
    label: "Compare",
    hint: "any two repos",
    icon: GitCompare,
  },
  {
    href: "/submit",
    label: "Drop a repo",
    hint: "ingest in 20 min",
    icon: Send,
  },
];

export function HomeCtaRow() {
  return (
    <nav
      aria-label="Quick links"
      className="flex flex-wrap items-center gap-2"
    >
      {LINKS.map(({ href, label, hint, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group inline-flex items-center gap-2 rounded-full border border-border-primary bg-bg-secondary/60 px-3 py-1.5 text-xs font-mono text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
        >
          <Icon
            size={12}
            aria-hidden="true"
            className="text-text-tertiary group-hover:text-brand"
          />
          <span className="font-medium text-text-primary">{label}</span>
          <span className="hidden sm:inline text-text-tertiary">{hint}</span>
          <ArrowRight
            size={11}
            aria-hidden="true"
            className="text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
          />
        </Link>
      ))}
    </nav>
  );
}
