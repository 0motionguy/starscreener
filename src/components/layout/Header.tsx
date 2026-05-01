"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { HamburgerButton } from "@/components/layout/HamburgerButton";
import { FreshBadge } from "@/components/layout/FreshBadge";
import { SystemMark } from "@/components/v3";

export function Header() {
  return (
    <header className="topbar">
      <div className="flex h-full w-full items-center gap-[14px]">
        <div className="brand">
          <HamburgerButton />
          <Link
            href={ROUTES.HOME}
            className="group flex items-center gap-2.5"
            aria-label="TrendingRepo home"
          >
            <span
              aria-hidden
              className="brand-mark"
            >
              <SystemMark size={20} />
            </span>

            <span className="flex flex-col leading-none">
              <span className="brand-name inline-flex items-center leading-none">
                TRENDING<span style={{ color: "var(--v4-acc)" }}>REPO</span>
              </span>
              <span
                aria-hidden="true"
                className="brand-sub mt-0.5 hidden leading-none sm:inline"
              >
                {"// TRENDINGREPO / TREND MAP FOR OPEN SOURCE"}
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden flex-1 sm:flex">
          <SearchBar placeholder="search repos..." fullWidth />
        </div>

        <div className="topbar-actions">
          <FreshBadge />
          <Link
            href={ROUTES.SUBMIT}
            className="pill cta"
            aria-label="Drop your repo"
          >
            <Send className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Drop repo</span>
            <span aria-hidden>-&gt;</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
