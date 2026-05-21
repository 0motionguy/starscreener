"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { ArrowLeftRight } from "@/lib/icons";
import { HeartIcon, FilledBellIcon } from "@/components/icons-animated";

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

interface TrendingRowActionsProps {
  repo: string;
}

export function TrendingRowActions({ repo }: TrendingRowActionsProps) {
  const [watched, setWatched] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [compared, setCompared] = useState(false);

  function toast(text: string) {
    window.TR?.showToast?.(text);
  }

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
      <button
        type="button"
        className={`row-act${compared ? " watched" : ""}`}
        title={compared ? "In compare slot" : "Add to compare"}
        aria-pressed={compared}
        onClick={() => {
          const next = !compared;
          setCompared(next);
          toast(next ? `${repo} added to compare` : `${repo} removed from compare`);
        }}
      >
        <motion.span
          whileHover={{ x: [0, -2, 2, 0] }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ display: "inline-flex", lineHeight: 0 }}
        >
          <ArrowLeftRight size={14} strokeWidth={2} aria-hidden="true" />
        </motion.span>
      </button>
    </div>
  );
}
