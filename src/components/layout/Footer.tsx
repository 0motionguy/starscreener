import { FooterBar, FooterLink } from "@/components/ui/FooterBar";

const FOOTER_LINKS = [
  {
    href: "https://github.com/0motionguy/starscreener",
    label: "GitHub",
    external: true,
  },
  {
    href: "https://www.linkedin.com/company/trendingrepo",
    label: "LinkedIn",
    external: true,
  },
  {
    href: "https://www.youtube.com/@trendingrepo",
    label: "YouTube",
    external: true,
  },
  {
    href: "https://www.reddit.com/r/trendingrepo",
    label: "Reddit",
    external: true,
  },
  {
    href: "https://www.g2.com/products/trendingrepo",
    label: "G2",
    external: true,
  },
  {
    href: "https://x.com/0motionguy",
    label: "@0motionguy",
    external: true,
  },
  { href: "/portal/docs", label: "API Docs", external: false },
  { href: "/cli", label: "CLI", external: false },
] as const;

export function Footer() {
  return (
    <footer
      className="w-full px-4 md:px-6 py-6 pb-24 md:pb-6"
      style={{ background: "var(--v4-bg-000)" }}
    >
      <FooterBar as="div" className="mx-auto max-w-7xl">
        <p
          className="text-xs"
          style={{ color: "var(--v4-ink-400)" }}
        >
          <span
            className="font-mono font-medium"
            style={{ color: "var(--v4-ink-300)" }}
          >
            TrendingRepo
          </span>{" "}
          by{" "}
          <a
            href="https://agntdot.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:[color:var(--v4-ink-200)]"
            style={{ color: "var(--v4-ink-300)" }}
          >
            AGNTDOT.com
          </a>
        </p>

        <nav className="flex items-center gap-4">
          {FOOTER_LINKS.map(({ href, label, external }) => (
            <FooterLink key={label} href={href} external={external}>
              {label}
            </FooterLink>
          ))}
        </nav>
      </FooterBar>
    </footer>
  );
}
