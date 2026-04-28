"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { HamburgerButton } from "@/components/layout/HamburgerButton";
import { FreshBadge } from "@/components/layout/FreshBadge";
import { SystemMark } from "@/components/v3";

export function Header() {
  return (
    <header className="v3-chrome sticky top-0 z-40 h-14 w-full border-b backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <HamburgerButton />
          <Link
            href={ROUTES.HOME}
            className="group flex items-center gap-2.5"
            aria-label="TrendingRepo home"
          >
            <span
              aria-hidden
              className="relative inline-flex"
              style={{ boxShadow: "0 0 12px var(--v3-acc-glow)" }}
            >
              <SystemMark size={20} />
            </span>

            <span className="flex flex-col leading-none">
              <span className="v3-wordmark inline-flex items-center leading-none">
                TRENDING<span style={{ color: "var(--v3-acc)" }}>REPO</span>
              </span>
              <span
                aria-hidden="true"
                className="v3-label mt-0.5 hidden leading-none sm:inline"
              >
                {"// TRENDINGREPO / TREND MAP FOR OPEN SOURCE"}
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden flex-1 sm:flex max-w-md mx-2 md:mx-6">
          <SearchBar placeholder="search repos..." fullWidth />
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <FreshBadge />
          <Link
            href={ROUTES.SUBMIT}
            className="v3-button v3-button-primary"
            aria-label="Drop your repo"
          >
            <Send className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Drop repo</span>
            <span aria-hidden>-&gt;</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
