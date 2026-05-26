"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useCompareStore } from "@/lib/store";
import { ChartBarIcon } from "@/components/icons-animated";

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

// Stable empty references for the pre-mount selector branches. Returning a
// fresh [] / {} from a Zustand (useSyncExternalStore) selector on every render
// makes React see a new snapshot each time → infinite re-render (#185). Reuse
// one reference per shape instead.
const EMPTY_REPOS: string[] = [];
const EMPTY_NAMES: Record<string, string> = {};

interface RepoCompareButtonProps {
  repoId: string;
  fullName: string;
}

export function RepoCompareButton({ repoId, fullName }: RepoCompareButtonProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isComparing = useCompareStore((s) =>
    mounted ? s.isComparing(repoId) : false,
  );
  const isFull = useCompareStore((s) => (mounted ? s.isFull() : false));
  const addRepo = useCompareStore((s) => s.addRepo);
  const removeRepo = useCompareStore((s) => s.removeRepo);
  const trayList = useCompareStore((s) => (mounted ? s.repos : EMPTY_REPOS));
  const fullNamesById = useCompareStore((s) =>
    mounted ? s.fullNamesById : EMPTY_NAMES,
  );

  const disabled = !isComparing && isFull;

  const trayFullNames = trayList
    .map((id) => fullNamesById[id])
    .filter((n): n is string => typeof n === "string" && n.includes("/"));
  const listForHref = isComparing
    ? trayFullNames
    : Array.from(new Set([...trayFullNames, fullName]));
  const href = `/tools/compare?repos=${listForHref.map(encodeURIComponent).join(",")}`;

  return (
    <Link
      href={href}
      prefetch={false}
      className={`btn${isComparing ? " primary" : ""}`}
      data-compare
      aria-pressed={isComparing}
      aria-disabled={disabled || undefined}
      title={
        disabled
          ? "Compare tray is full — open /tools/compare to make room"
          : isComparing
            ? "Open comparison · click again to remove"
            : "Add to compare and open"
      }
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        if (isComparing) {
          removeRepo(repoId);
          window.TR?.showToast?.(`${fullName} removed from compare`);
          e.preventDefault();
          return;
        }
        addRepo(repoId, fullName);
        window.TR?.showToast?.(`${fullName} added to compare`);
      }}
    >
      <ChartBarIcon size={14} color="currentColor" aria-hidden="true" />
      {isComparing ? "Open compare" : "Compare"}
    </Link>
  );
}
