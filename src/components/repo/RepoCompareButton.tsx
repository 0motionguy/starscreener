"use client";

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
      <ChartBarIcon size={14} color="currentColor" aria-hidden="true" />
      {isComparing ? "Compared" : "Compare"}
    </button>
  );
}
