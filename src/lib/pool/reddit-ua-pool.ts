import { RedditPoolExhaustedError } from "@/lib/errors";
import {
  isUserAgentQuarantined,
  type RedditQuarantineParams,
} from "@/lib/pool/reddit-telemetry";
import configuredUserAgents from "@/../config/reddit-user-agents.json";
import { createHash } from "node:crypto";

const DEFAULT_USER_AGENTS = [
  "trendingrepo-scanner/1.0 (+https://trendingrepo.com)",
];

const userAgents = (
  Array.isArray(configuredUserAgents) ? configuredUserAgents : []
)
  .map((value) => (typeof value === "string" ? value.trim() : ""))
  .filter(Boolean);

const pool = userAgents.length > 0 ? userAgents : DEFAULT_USER_AGENTS;
let cursor = 0;

export function redditUserAgentFingerprint(userAgent: string): string {
  const cleaned = userAgent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return "reddit-ua-unknown";
  const hash = createHash("sha256").update(userAgent).digest("hex").slice(0, 8);
  return `${cleaned.slice(0, 24)}-${hash}`;
}

export async function selectUserAgent(): Promise<string> {
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const idx = (cursor + attempt) % pool.length;
    const userAgent = pool[idx];
    const fingerprint = redditUserAgentFingerprint(userAgent);
    if (!(await isUserAgentQuarantined(fingerprint))) {
      cursor = (idx + 1) % pool.length;
      return userAgent;
    }
  }

  throw new RedditPoolExhaustedError("All Reddit User-Agents quarantined", {
    quarantinedCount: pool.length,
  });
}

export function _resetRedditUserAgentPoolForTests(): void {
  cursor = 0;
}

export function _redditPoolSnapshotForTests(): readonly string[] {
  return [...pool];
}

export type { RedditQuarantineParams };
