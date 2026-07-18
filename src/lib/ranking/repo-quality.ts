// Quality gate for the public trend boards.
//
// Pirated-software / crack / warez / darknet-market repos game the
// star-velocity rankers: bot-farmed stars on a brand-new tiny repo is exactly
// the signature GAINER and DISCOVERY reward, so they surface on the homepage
// next to real trending projects (observed live 2026-07-05: DISCOVERY was
// ~60% "*-cracked", "*-Crack-2026", "we-the-north-market" darknet links).
// This drops the egregious ones by name + description signature BEFORE ranking.
//
// Precision over recall — every pattern is tuned to spare legit repos:
//   crack-detection / crack_segmentation (ML), CrackMapExec (pentest),
//   hashcat, webtorrent, growth-hacking, hackathon all PASS. We only catch
//   piracy-SHAPED names (crack/cracked at a name boundary, or paired with a
//   year / premium / download qualifier), unambiguous piracy tokens (keygen,
//   nulled, warez, activator, aimbot, wallhack, mod-menu), darknet markets,
//   and piracy-phrase descriptions. Bare "crack" is intentionally NOT matched.

import type { Repo } from "@/lib/types";

// Matched against the lowercased "owner/name".
const NAME_SPAM_PATTERNS: RegExp[] = [
  // crack / cracked at the very end of the name: "…-Pinnacle-Studio-26-Crack",
  // "…-Premium-cracked". crack-detection / crackmapexec do NOT end this way.
  /[-_/](crack|cracked)$/,
  // crack / cracked paired with a piracy qualifier: "…-Crack-2026",
  // "…-Cracked-2026", "…-crack-download". "crack-detection" is not (detection
  // isn't a qualifier).
  /[-_](crack|cracked)[-_](20\d\d|latest|full|free|download|premium|pro|repack|patch(ed)?)\b/,
  /\b(premium|pro|full)[-_]?cracked\b/,
  // Unambiguous piracy / cheat tokens.
  /\b(keygen|nulled|warez|activator|aimbot|wallhack|mod-menu)\b/,
  /\b(external[-_]dayz[-_]cheats?|elden[-_]ring[-_]unlocked[-_]tools?|red[-_]giant[-_]download)\b/,
  /\bpre-?activated\b/,
  // Darknet-market spam ("we-the-north-market-market-wethenorth-org").
  /\b(we-the-north|wethenorth)\b/,
  /[-_]market[-_]market[-_]/,
  /\bdarknet\b/,
];

// Matched against the lowercased description. High-precision piracy phrases —
// a legit "surface crack detection" description contains none of these.
const DESC_SPAM_PATTERNS: RegExp[] = [
  /\b(activation key|serial key|license key generator)\b/,
  /\bfree download\b[^.]{0,40}\b(crack|cracked|full version|premium)\b/,
  /\b(keygen|nulled|warez)\b/,
  /\bcracked (version|software|download|apk|full)\b/,
  /\bpre-?activated\b/,
];

type QualityRepo = Pick<Repo, "fullName" | "description"> & { name?: string };

/**
 * True when a repo is piracy / crack / warez / darknet spam that should never
 * appear on a public trend board. Name signature first (catches ~all observed
 * cases), then description phrases as a backstop for clean-named spam.
 */
export function isSpamRepo(repo: QualityRepo): boolean {
  const name = (repo.fullName || repo.name || "").toLowerCase();
  for (const re of NAME_SPAM_PATTERNS) if (re.test(name)) return true;
  const desc = (repo.description || "").toLowerCase();
  for (const re of DESC_SPAM_PATTERNS) if (re.test(desc)) return true;
  return false;
}

/** Drop spam repos from a list, preserving order. */
export function filterSpamRepos<T extends QualityRepo>(repos: T[]): T[] {
  return repos.filter((r) => !isSpamRepo(r));
}
