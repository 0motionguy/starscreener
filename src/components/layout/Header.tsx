"use client";

import Link from "next/link";
import Image from "next/image";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { HamburgerButton } from "@/components/layout/HamburgerButton";

const BRAND_KIT_HREF = "/brand/trendingrepo-brand-kit.zip";

// AGN-644 — right-clicking the wordmark surfaces a toast with a download
// link to the brand kit zip. Suppresses the native context menu only on the
// brand area; everywhere else the browser default still wins.
function handleBrandContextMenu(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  toast("Download TrendingRepo brand assets", {
    action: {
      label: "Download .zip",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.location.href = BRAND_KIT_HREF;
        }
      },
    },
  });
}

export function Header() {
  return (
    <header className="topbar">
      <div className="flex h-full w-full items-center gap-2 sm:gap-[14px]">
        <div className="brand min-w-0 flex-1 md:flex-initial">
          <HamburgerButton />
          <Link
            href={ROUTES.HOME}
            onContextMenu={handleBrandContextMenu}
            className="group flex min-w-0 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
            aria-label="TrendingRepo home (right-click for brand assets)"
          >
            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <span
                aria-hidden
                className="brand-mark"
              >
                <Image
                  src="/brand/trendingrepo-mark.svg"
                  alt=""
                  width={18}
                  height={18}
                  className="block size-[18px] shrink-0"
                  priority
                />
              </span>

              <span className="brand-name inline-flex min-w-0 items-center gap-1.5 leading-none sm:gap-2">
                <span className="truncate">
                  TRENDING<span style={{ color: "var(--v4-acc)" }}>REPO</span>
                </span>
                <span className="brand-beta hidden sm:inline-flex">BETA</span>
              </span>
            </span>

            <span
              aria-hidden="true"
              className="brand-sub mt-0.5 hidden leading-none sm:inline"
              style={{ paddingLeft: "calc(24px + 0.625rem)" }}
            >
              {"// TRENDINGREPO / TREND MAP FOR OPEN SOURCE"}
            </span>
          </Link>
        </div>

        <div className="hidden flex-1 sm:flex">
          <SearchBar placeholder="search repos..." fullWidth />
        </div>

        <div className="topbar-actions shrink-0">
          <Link
            href={ROUTES.SUBMIT}
            className="pill cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
            aria-label="Drop your repo"
          >
            <Send className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Drop repo</span>
            <span className="hidden sm:inline" aria-hidden>-&gt;</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
