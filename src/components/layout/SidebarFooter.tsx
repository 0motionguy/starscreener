"use client";

/**
 * SidebarFooter — theme toggle + settings + github + version strip.
 *
 * 48px tall, sits at the bottom of both desktop Sidebar and mobile drawer.
 * Settings route isn't built yet — intentional dead link for now.
 */
import Link from "next/link";
import { Settings, Code2 } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { APP_VERSION } from "@/lib/app-meta";

const STARSCREENER_REPO_URL = "https://github.com/";

export function SidebarFooter() {
  return (
    <div className="h-12 px-3 border-t border-border-primary flex items-center gap-2 shrink-0">
      <ThemeToggle />
      <Link
        href="/settings"
        aria-label="Settings"
        className="w-8 h-8 flex items-center justify-center rounded-button border border-border-primary bg-bg-secondary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
      >
        <Settings className="w-4 h-4" strokeWidth={2} />
      </Link>
      <a
        href={STARSCREENER_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub repository"
        className="w-8 h-8 flex items-center justify-center rounded-button border border-border-primary bg-bg-secondary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
      >
        <Code2 className="w-4 h-4" strokeWidth={2} />
      </a>
      <span className="ml-auto font-mono text-[10px] text-text-muted tabular-nums">
        v{APP_VERSION}
      </span>
    </div>
  );
}
