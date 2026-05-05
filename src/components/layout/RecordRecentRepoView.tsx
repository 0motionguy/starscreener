"use client";

import { useEffect } from "react";
import {
  getRecentViewedReposEvent,
  recordRecentRepoView,
} from "@/lib/recent-viewed-repos";

export function RecordRecentRepoView({ repoId }: { repoId: string }) {
  useEffect(() => {
    try {
      recordRecentRepoView(window.localStorage, repoId);
      window.dispatchEvent(new Event(getRecentViewedReposEvent()));
    } catch {
      // localStorage may be unavailable; sidebar widget is best-effort.
    }
  }, [repoId]);

  return null;
}
