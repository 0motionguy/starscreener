"use client";

import Link from "next/link";
import Image from "next/image";
import { Send } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { HamburgerButton } from "@/components/layout/HamburgerButton";
import { FreshBadge } from "@/components/layout/FreshBadge";

export function Header() {
  return (
    <header className="topbar">
      <div className="flex h-full w-full items-center gap-[14px]">
        <div className="brand">
          <HamburgerButton />
          <Link
            href={ROUTES.HOME}
            className="group flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
            aria-label="TrendingRepo home"
          >
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

            <span className="flex flex-col leading-none">
              <span className="brand-name inline-flex items-center gap-2 leading-none">
                <span>
                  TRENDING<span style={{ color: "var(--v4-acc)" }}>REPO</span>
                </span>
                <span className="brand-beta">BETA BATCH</span>
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
            className="pill cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
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
