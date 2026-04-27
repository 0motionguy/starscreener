"use client";

import { Code2, X } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { APP_VERSION } from "@/lib/app-meta";
import { AccentPicker, BgThemePicker, SystemBarcode } from "@/components/v3";

const STARSCREENER_REPO_URL = "https://github.com/0motionguy/starscreener";
const AUTHOR_TWITTER_URL = "https://x.com/0motionguy";

export function SidebarFooter() {
  return (
    <div
      className="shrink-0 space-y-3 border-t px-3 py-3"
      style={{ borderColor: "var(--v3-line-100)" }}
    >
      <BgThemePicker compact />
      <AccentPicker compact />
      <SystemBarcode
        label="// PROD"
        value={`v${APP_VERSION}`}
        bars={18}
        height={18}
      />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href={STARSCREENER_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="v3-button h-9 w-9 p-0"
        >
          <Code2 className="h-4 w-4" strokeWidth={2} />
        </a>
        <a
          href={AUTHOR_TWITTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Author on X / Twitter"
          className="v3-button h-9 w-9 p-0"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
