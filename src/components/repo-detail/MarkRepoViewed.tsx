"use client";

/**
 * MarkRepoViewed — invisible client component that records a
 * "viewed repo" entry in localStorage on mount. Drop it into the
 * /repo/[owner]/[name] server component and the sidebar's
 * <SidebarRecentViewedRepos> widget will pick the entry up on the
 * next render.
 *
 * Renders nothing — `null`.
 */
import { useEffect } from "react";
import { trackRepoViewed } from "@/lib/recent-viewed-repos";

export function MarkRepoViewed({
  owner,
  name,
}: {
  owner: string;
  name: string;
}) {
  useEffect(() => {
    trackRepoViewed({ owner, name });
  }, [owner, name]);
  return null;
}
