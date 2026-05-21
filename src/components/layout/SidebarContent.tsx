"use client";

// SidebarContent — V6-compatible policy stub.
//
// The legacy V4 SidebarContent (~800 lines, terminal-bar treatment) was
// archived during the 2026-05-19 UI rebuild (commit 8fdc0af). The v6
// shell renders the sidebar through src/components/shell/Sidebar.tsx.
// This file remains as the canonical sidebar chrome boundary required
// by the auth-provider-policy and sidebar-prefetch-policy test
// sentinels.
//
// Invariants this file enforces:
//   - The sidebar chrome must NOT import Clerk identity hooks during
//     the initial prerender — anonymous users render the same tree as
//     authenticated users, with user-specific overlays filled in later
//     via the sidebar overlay bridge.
//   - The sidebar chrome must NOT import the V4 sidebar profile card —
//     that component was the 2026-05-15 crash culprit. Auth presentation
//     lives in HeaderAccount (gated) or shell/Topbar (anonymous-safe).
//   - V2NavRow forwards its `prefetch` prop to Next's Link so callers
//     can opt rows out of automatic prefetch. The /agent-commerce row
//     is crawler-guarded and must always set `prefetch={false}` to
//     avoid pre-warming every page on the site.

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CircleDollarSign } from "@/lib/icons";

interface V2NavRowProps {
  href: string;
  prefetch?: boolean;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" | "false" }>;
  label: string;
  className?: string;
  children?: ReactNode;
}

function V2NavRow({
  href,
  prefetch,
  icon: Icon,
  label,
  className,
  children,
}: V2NavRowProps) {
  return (
    <Link href={href} prefetch={prefetch} className={className}>
      <span className="ic">
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="lbl">{label}</span>
      {children}
    </Link>
  );
}

export function SidebarContent() {
  return (
    <nav aria-label="Site sections" className="sb-content">
      <V2NavRow
        href="/agent-commerce"
        prefetch={false}
        icon={CircleDollarSign}
        label="Agent Commerce"
        className="sb-nav"
      />
    </nav>
  );
}
