import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { GithubIcon, XIcon } from "@/components/brand/BrandIcons";
import type { Launch } from "@/lib/producthunt";

function normalizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function repoLabel(href: string): string {
  return href.replace(/^https?:\/\/github\.com\//, "");
}

export function LaunchLinkIcons({
  launch,
  className = "",
}: {
  launch: Launch;
  className?: string;
}) {
  const website = normalizeHref(launch.website);
  const github = normalizeHref(launch.githubUrl);
  const x = normalizeHref(launch.xUrl);

  const links: {
    href: string;
    label: string;
    icon: ReactNode;
  }[] = [];

  if (website && website !== github && website !== x) {
    links.push({
      href: website,
      label: `Open ${launch.name} website`,
      icon: <Globe size={12} strokeWidth={2} />,
    });
  }
  if (x) {
    links.push({
      href: x,
      label: `Open ${launch.name} on X`,
      icon: <XIcon size={12} monochrome />,
    });
  }
  if (github) {
    const stars = launch.githubRepo?.stars;
    links.push({
      href: github,
      label: stars !== undefined
        ? `${repoLabel(github)} - ${stars.toLocaleString("en-US")} stars`
        : repoLabel(github),
      icon: <GithubIcon size={12} monochrome />,
    });
  }

  if (links.length === 0) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      {links.map((link) => (
        <a
          key={`${launch.id}-${link.href}`}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
          className="inline-flex size-5 items-center justify-center rounded border border-border-primary/70 bg-bg-primary/40 text-text-tertiary hover:border-border-primary hover:text-text-primary transition-colors"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
