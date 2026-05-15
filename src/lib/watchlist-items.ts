import type { WatchlistItem } from "@/lib/types";
import { idToSlug } from "@/lib/utils";

export function watchlistItemFullName(item: WatchlistItem): string {
  if (item.fullName && item.fullName.includes("/")) {
    return item.fullName;
  }
  return idToSlug(item.repoId);
}

export function repoFullNameHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "/";
  return `/repo/${owner}/${name}`;
}

export function watchlistItemHref(item: WatchlistItem): string {
  return repoFullNameHref(watchlistItemFullName(item));
}
