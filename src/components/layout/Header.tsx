"use client";

// Header — V6-compatible policy stub.
//
// The legacy V4 Header was archived during the 2026-05-19 UI rebuild
// (commit 8fdc0af). The v6 shell renders chrome through
// src/components/shell/Topbar.tsx + Sidebar.tsx instead. This file
// remains as the canonical mount point for the HeaderAccount auth
// boundary, gated by the server-resolved `authEnabled` prop pattern
// the auth-provider-policy test enforces.
//
// When the v6 shell decides to re-introduce a dedicated header slot
// (or when the Topbar accepts a slot for auth chrome), the layout can
// import and mount <Header authEnabled={Boolean(clerkPublishableKey)} />
// without changing any of the policy invariants this file enforces.

import { HeaderAccount } from "@/components/layout/HeaderAccount";

interface HeaderProps {
  authEnabled: boolean;
}

export function Header({ authEnabled }: HeaderProps) {
  return (
    <div className="header-account-slot">
      <HeaderAccount authEnabled={authEnabled} />
    </div>
  );
}
