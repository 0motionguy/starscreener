// HomeCtaRow — compact nav row under the hero (V2 button styling).
//
// Five high-intent destinations, rendered as V2 mono buttons so a visitor
// can jump straight to the surface that matters to them (submit a repo,
// breakouts leaderboard, verified revenue, funding events, or compare)
// without scrolling through the full terminal. Pure server component — no
// client JS, no store dependencies, zero hydration cost.
//
// Visual: first action ("Drop a repo") is the primary accent button so
// submit intent always wins the eye. The rest are ghost buttons. Each
// button label gets a trailing `→` glyph for the V2 terminal feel.

import Link from "next/link";

interface CtaLink {
  href: string;
  label: string;
  /** Render as the orange primary action; only one in the row. */
  primary?: boolean;
}

const LINKS: CtaLink[] = [
  { href: "/submit", label: "Drop a repo", primary: true },
  { href: "/breakouts", label: "Breakouts" },
  { href: "/revenue", label: "Revenue" },
  { href: "/funding", label: "Funding" },
  { href: "/compare", label: "Compare" },
];

export function HomeCtaRow() {
  return (
    <nav
      aria-label="Quick links"
      className="flex flex-wrap items-center gap-3"
    >
      {LINKS.map(({ href, label, primary }) => (
        <Link
          key={href}
          href={href}
          className={`v2-btn ${primary ? "v2-btn-primary" : "v2-btn-ghost"} gap-2`}
        >
          <span>{label}</span>
          <span aria-hidden="true">→</span>
        </Link>
      ))}
    </nav>
  );
}
