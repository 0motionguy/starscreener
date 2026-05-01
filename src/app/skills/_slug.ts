// Slug helpers for /skills routes.
//
// Skill IDs may contain "/" and "#" (composite Smithery `namespace/slug` and
// skillsmp `parent#child` shapes). Encode as base64url so the slug round-trips
// safely through Next.js dynamic-segment matching.

export function encodeSkillSlug(id: string): string {
  return Buffer.from(id, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeSkillSlug(slug: string): string {
  let b64 = slug.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return Buffer.from(b64, "base64").toString("utf8");
}
