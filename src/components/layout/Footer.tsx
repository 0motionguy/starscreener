import { FooterBar, FooterLink } from "@/components/ui/FooterBar";

const FOOTER_LINKS = [
  {
    href: "https://github.com/0motionguy/starscreener",
    label: "GitHub",
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
    <footer className="w-full bg-bg-primary px-4 md:px-6 py-6 pb-24 md:pb-6">
      <FooterBar as="div" className="mx-auto max-w-7xl">
        <p className="text-xs text-text-muted">
          <span className="font-mono font-medium text-text-tertiary">
            TrendingRepo
          </span>{" "}
          by{" "}
          <a
            href="https://agntdot.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-tertiary hover:text-text-secondary transition-colors"
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
