import type { WatchlistItem } from "@/lib/types";
import { idToSlug } from "@/lib/utils";

export function watchlistItemFullName(item: WatchlistItem): string {
  if (item.fullName && item.fullName.includes("/")) {
    return item.fullName;
  }
  return idToSlug(item.repoId);
}

export function watchlistItemHref(item: WatchlistItem): string {
  const fullName = watchlistItemFullName(item);
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "/";
  return `/repo/${owner}/${name}`;
}
