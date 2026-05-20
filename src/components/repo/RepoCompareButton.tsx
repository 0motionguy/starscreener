"use client";

import { useEffect, useState } from "react";

import { useCompareStore } from "@/lib/store";

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

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

  const disabled = !isComparing && isFull;

  return (
    <button
      type="button"
      className={`btn${isComparing ? " primary" : ""}`}
      data-compare
      aria-pressed={isComparing}
      disabled={disabled}
      title={disabled ? "Compare tray is full" : "Add or remove from compare"}
      onClick={() => {
        if (disabled) return;
        if (isComparing) {
          removeRepo(repoId);
          window.TR?.showToast?.(`${fullName} removed from compare`);
        } else {
          addRepo(repoId, fullName);
          window.TR?.showToast?.(`${fullName} added to compare`);
        }
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M3 8h4l1-3 2 6 1-3h2" />
      </svg>
      {isComparing ? "Compared" : "Compare"}
    </button>
  );
}
