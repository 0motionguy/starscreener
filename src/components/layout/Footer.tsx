import Link from "next/link";
import { cn } from "@/lib/utils";

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
    <footer
      className={cn(
        "w-full border-t border-border-primary",
        "bg-bg-primary",
        "px-4 md:px-6 py-6 pb-24 md:pb-6"
      )}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          <span className="font-mono font-medium text-text-tertiary">
            StarScreener
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
          {FOOTER_LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {label}
              </Link>
            )
          )}
        </nav>
      </div>
    </footer>
  );
}
