import type { RepoProfile } from "./repo-profiles";

export interface RepoEnrichmentChecklistItems {
  hasWebsiteUrl: boolean;
  hasDocsUrl: boolean;
  hasNpmPackages: boolean;
  hasProductHuntLaunch: boolean;
  hasAisoScan: boolean;
  isScanned: boolean;
}

export interface RepoEnrichmentChecklist {
  fullName: string;
  completed: number;
  total: number;
  completionRatio: number;
  items: RepoEnrichmentChecklistItems;
}

export interface RepoEnrichmentChecklistSummary {
  repoCount: number;
  completedItems: number;
  totalItems: number;
  completionRatio: number;
}

const CHECKLIST_ITEM_KEYS: Array<keyof RepoEnrichmentChecklistItems> = [
  "hasWebsiteUrl",
  "hasDocsUrl",
  "hasNpmPackages",
  "hasProductHuntLaunch",
  "hasAisoScan",
  "isScanned",
];

export function buildRepoEnrichmentChecklist(
  profile: RepoProfile,
): RepoEnrichmentChecklist {
  const items: RepoEnrichmentChecklistItems = {
    hasWebsiteUrl: Boolean(profile.websiteUrl),
    hasDocsUrl: Boolean(profile.surfaces.docsUrl),
    hasNpmPackages: profile.surfaces.npmPackages.length > 0,
    hasProductHuntLaunch: Boolean(profile.surfaces.productHuntLaunchId),
    hasAisoScan: Boolean(profile.aisoScan),
    isScanned: profile.status === "scanned",
  };

  const completed = CHECKLIST_ITEM_KEYS.filter((key) => items[key]).length;
  const total = CHECKLIST_ITEM_KEYS.length;
  const completionRatio = total === 0 ? 0 : completed / total;

  return {
    fullName: profile.fullName,
    completed,
    total,
    completionRatio,
    items,
  };
}

export function summarizeRepoEnrichmentChecklists(
  checklists: RepoEnrichmentChecklist[],
): RepoEnrichmentChecklistSummary {
  const repoCount = checklists.length;
  const completedItems = checklists.reduce(
    (acc, checklist) => acc + checklist.completed,
    0,
  );
  const totalItems = checklists.reduce(
    (acc, checklist) => acc + checklist.total,
    0,
  );
  const completionRatio = totalItems === 0 ? 0 : completedItems / totalItems;

  return {
    repoCount,
    completedItems,
    totalItems,
    completionRatio,
  };
}
