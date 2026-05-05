"use client";

import { useEffect } from "react";
import {
  recordRecentRepoView,
  getRecentViewedReposEvent,
} from "@/lib/recent-viewed-repos";

export function MarkRepoViewed({
  owner,
  name,
}: {
  owner: string;
  name: string;
}) {
  useEffect(() => {
    const repoId = `${owner}/${name}`;
    try {
      recordRecentRepoView(window.localStorage, repoId);
      window.dispatchEvent(new Event(getRecentViewedReposEvent()));
    } catch {
      // localStorage may be unavailable; sidebar widget is best-effort.
    }
  }, [owner, name]);
  return null;
}
