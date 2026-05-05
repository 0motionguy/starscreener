import type { RepoProfile } from "./repo-profiles";

export const CORE_FIELD_KEYS = [
  "fullName",
  "rank",
  "selectedFrom",
  "status",
  "lastProfiledAt",
  "surfaces.githubUrl",
  "websiteUrl",
  "websiteSource",
  "aisoScan",
] as const;

export const ENRICHED_FIELD_KEYS = [
  "surfaces.docsUrl",
  "surfaces.npmPackages",
  "surfaces.productHuntLaunchId",
  "nextScanAfter",
  "error",
  "surfaces",
] as const;

export type CoreFieldKey = (typeof CORE_FIELD_KEYS)[number];
export type EnrichedFieldKey = (typeof ENRICHED_FIELD_KEYS)[number];

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function readPathValue(profile: RepoProfile, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = profile;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function getMissingCoreFields(profile: RepoProfile): string[] {
  return CORE_FIELD_KEYS.filter((path) => !hasValue(readPathValue(profile, path)));
}

export function getMissingEnrichedFields(profile: RepoProfile): string[] {
  return ENRICHED_FIELD_KEYS.filter(
    (path) => !hasValue(readPathValue(profile, path)),
  );
}

export function enrichCore(
  profile: RepoProfile,
  patch: Partial<RepoProfile>,
): RepoProfile {
  const next: RepoProfile = {
    ...profile,
    ...patch,
    surfaces: {
      ...profile.surfaces,
      ...(patch.surfaces ?? {}),
    },
  };
  return next;
}

export function hasHomepage(profile: RepoProfile): boolean {
  return hasNonEmptyString(profile.websiteUrl);
}

