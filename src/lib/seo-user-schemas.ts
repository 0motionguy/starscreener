import { SITE_NAME, absoluteUrl } from "@/lib/seo";

export interface UserPersonSchemaInput {
  handle: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  githubProfileUrl?: string | null;
}

export function buildUserPersonSchema(input: UserPersonSchemaInput): Record<string, unknown> {
  const profileUrl = absoluteUrl(`/u/${input.handle}`);

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${profileUrl}#person`,
    name: input.name || input.handle,
    alternateName: `@${input.handle}`,
    url: profileUrl,
    description:
      input.bio ||
      `Public profile of @${input.handle} on ${SITE_NAME}: ideas posted, repos shipped, and public reactions.`,
    ...(input.avatarUrl ? { image: input.avatarUrl } : {}),
    ...(input.githubProfileUrl ? { sameAs: [input.githubProfileUrl] } : {}),
  };
}
