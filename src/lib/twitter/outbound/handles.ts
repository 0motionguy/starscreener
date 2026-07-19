// Maker-tagging: resolve a repo owner (or AI lab / model provider) to its
// official X/Twitter handle so autopilot posts can @mention the maker. Tagged
// accounts get notified and frequently reboost to their own followers — the
// single cheapest reach multiplier available to the poster.
//
// Two sources, in precedence order:
//   1. A tiny CURATED map of marquee AI labs. These are the accounts people
//      most want tagged (OpenAI, Anthropic, Kimi, ...) AND the ones that leave
//      their GitHub `twitter_username` blank, so the dynamic source below can't
//      reach them. Every entry here is HAND-VERIFIED against the lab's own
//      public confirmation — a wrong handle tags an impostor (Moonshot warned
//      publicly that @Kimi__Moonshot, double underscore, is a scam clone of the
//      real @Kimi_Moonshot). Do not add an entry you have not verified.
//   2. GitHub's self-declared `twitter_username` on the owner's org/user
//      profile (already fetched + stored by the repo-community-profile worker).
//      Self-declared = authoritative by definition, zero mis-tag risk.
//
// Pure string logic only — no I/O, no secrets, no server APIs (so no
// `server-only` marker — this stays unit-testable under node:test and safe to
// import anywhere). The caller supplies the GitHub-declared handle (read from
// the community-profile slug); this module just picks + cleans.

/**
 * Owner login (GitHub org/user, lowercased) -> verified official X handle
 * (no leading @). Deliberately small. Keyed by GitHub owner so a repo's
 * `owner/name` resolves directly. Only marquee AI labs whose GitHub profile
 * leaves `twitter_username` empty belong here; everyone else flows through the
 * self-declared GitHub field.
 */
export const AI_LAB_HANDLES: Readonly<Record<string, string>> = {
  openai: "OpenAI",
  anthropics: "AnthropicAI",
  "anthropic-ai": "AnthropicAI",
  "google-deepmind": "GoogleDeepMind",
  deepmind: "GoogleDeepMind",
  "meta-llama": "AIatMeta",
  facebookresearch: "AIatMeta",
  mistralai: "MistralAI",
  moonshotai: "Kimi_Moonshot", // verified: Moonshot's only official account
  "deepseek-ai": "deepseek_ai",
};

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Normalize a raw handle candidate to a bare, valid X handle or null.
 * Strips a leading @ and surrounding space; rejects anything that isn't a
 * legal X handle (1-15 chars of [A-Za-z0-9_]). A full URL, an email, or a
 * display name all correctly return null rather than tagging garbage.
 */
export function sanitizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@+/, "");
  return HANDLE_RE.test(h) ? h : null;
}

/**
 * Resolve the handle to tag for a repo. Curated AI-lab map wins (marquee labs
 * we want tagged with a verified handle), else the owner's GitHub-declared
 * `twitter_username`. Returns a bare handle (no @) or null when neither source
 * yields a valid handle.
 */
export function resolveRepoHandle(
  fullName: string,
  githubTwitterUsername?: string | null,
): string | null {
  const owner = fullName.split("/")[0]?.toLowerCase() ?? "";
  const curated = AI_LAB_HANDLES[owner];
  if (curated) return curated;
  return sanitizeHandle(githubTwitterUsername);
}
