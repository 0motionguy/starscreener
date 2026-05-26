"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

import { Icon } from "@/lib/icons";
import { HeartIcon, FilledBellIcon } from "@/components/icons-animated";
import { useCompareStore } from "@/lib/store";

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

interface TrendingRowActionsProps {
  repo: string;
  /** Optional canonical id (owner--name). Falls back to deriving from `repo`. */
  repoId?: string;
}

// Stable empty references for the pre-mount selector path. Inlining `[]` / `{}`
// inside a Zustand selector returns a new object each call, which makes
// useSyncExternalStore's server snapshot non-cacheable and triggers React's
// "getServerSnapshot should be cached to avoid an infinite loop" error.
const EMPTY_COMPARE_REPOS: string[] = [];
const EMPTY_FULL_NAMES_BY_ID: Record<string, string> = {};

function deriveId(fullName: string): string {
  if (fullName.includes("/")) {
    return fullName.replace("/", "--");
  }
  return fullName;
}

export function TrendingRowActions({ repo, repoId }: TrendingRowActionsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const id = repoId ?? deriveId(repo);

  const [watched, setWatched] = useState(false);
  const [alerted, setAlerted] = useState(false);

  const isComparing = useCompareStore((s) => (mounted ? s.isComparing(id) : false));
  const isFull = useCompareStore((s) => (mounted ? s.isFull() : false));
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const compareList = useCompareStore((s) =>
    mounted ? s.repos : EMPTY_COMPARE_REPOS,
  );
  const fullNamesById = useCompareStore((s) =>
    mounted ? s.fullNamesById : EMPTY_FULL_NAMES_BY_ID,
  );

  function toast(text: string) {
    window.TR?.showToast?.(text);
  }

  function buildCompareHref(): string {
    const fullNames = compareList
      .map((rid) => fullNamesById[rid])
      .filter((n): n is string => typeof n === "string" && n.includes("/"));
    const list = isComparing ? fullNames : [...fullNames, repo];
    const dedup = Array.from(new Set(list));
    return `/tools/compare?repos=${dedup.map(encodeURIComponent).join(",")}`;
  }

  const compareDisabled = !isComparing && isFull;

  return (
    <div className="row-acts" aria-label={`Actions for ${repo}`}>
      <button
        type="button"
        className={`row-act${watched ? " watched" : ""}`}
        title={watched ? "Remove from watchlist" : "Add to watchlist"}
        aria-pressed={watched}
        onClick={() => {
          const next = !watched;
          setWatched(next);
          toast(next ? `${repo} added to watchlist` : `${repo} removed from watchlist`);
        }}
      >
        <HeartIcon size={14} color={watched ? "var(--accent)" : "currentColor"} />
      </button>
      <button
        type="button"
        className={`row-act${alerted ? " watched" : ""}`}
        title={alerted ? "Alert armed" : "Set alert"}
        aria-pressed={alerted}
        onClick={() => {
          const next = !alerted;
          setAlerted(next);
          toast(next ? `Alert armed for ${repo}` : `Alert muted for ${repo}`);
        }}
      >
        <FilledBellIcon size={14} color="currentColor" />
      </button>
      <Link
        href={buildCompareHref()}
        prefetch={false}
        className={`row-act${isComparing ? " watched" : ""}`}
        title={
          compareDisabled
            ? "Compare tray full — open compare to remove one"
            : isComparing
              ? "Open compare with this repo"
              : "Add to compare and open"
        }
        aria-pressed={isComparing}
        aria-disabled={compareDisabled || undefined}
        onClick={(e) => {
          if (compareDisabled) {
            e.preventDefault();
            toast("Compare tray full — remove a repo first");
            return;
          }
          if (isComparing) {
            // Treat the second click as "remove" before navigation.
            removeCompare(id);
            toast(`${repo} removed from compare`);
            e.preventDefault();
            return;
          }
          addCompare(id, repo);
          toast(`${repo} added to compare`);
        }}
      >
        <motion.span
          whileHover={{ x: [0, -2, 2, 0] }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ display: "inline-flex", lineHeight: 0 }}
        >
          <Icon name="swap" size="md" />
        </motion.span>
      </Link>
    </div>
  );
}
