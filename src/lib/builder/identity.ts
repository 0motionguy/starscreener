// TrendingRepo — Builder identity (cookie-bound P0, GitHub OAuth in P1).
//
// A Builder is identified by an httpOnly cookie minted on first write. The
// cookie carries a random id (24 bytes, base64url). We mint the Builder row
// lazily on the first reaction or idea — anonymous reads never allocate one.
//
// P1 upgrade path: GitHub OAuth logs the user in and issues a signed session
// cookie that carries the same id. Existing reactions and ideas keep working
// because they reference the stable id.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Builder } from "./types";
import { getBuilderStore } from "./store";

const COOKIE_NAME = "tr_bid";
/** 2 years. The identity is durable until GitHub OAuth upgrades it. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;

/** Generate a new random builder id — URL-safe, 24 bytes. */
export function mintBuilderId(): string {
  return randomBytes(18)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Short handle for a newly minted builder — "builder-<first6>". */
export function defaultHandle(id: string): string {
  return `builder-${id.slice(0, 6).toLowerCase()}`;
}

/** Read the cookie id if present; does NOT mint one. */
export async function readBuilderId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Ensure a cookie is present; mint one if missing, and persist a Builder row.
 * Returns the id. Call from routes that write (reactions, ideas, sprints).
 */
export async function ensureBuilder(): Promise<Builder> {
  const jar = await cookies();
  let id = jar.get(COOKIE_NAME)?.value;
  if (!id) {
    id = mintBuilderId();
    jar.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  const store = getBuilderStore();
  let b = await store.getBuilder(id);
  const now = new Date().toISOString();
  if (!b) {
    b = {
      id,
      handle: defaultHandle(id),
      depthScore: 0.5,
      createdAt: now,
      lastActiveAt: now,
    };
    await store.upsertBuilder(b);
  } else if (b.lastActiveAt.slice(0, 10) !== now.slice(0, 10)) {
    // Bump lastActiveAt at most once per day to avoid write amplification.
    await store.upsertBuilder({ ...b, lastActiveAt: now });
  }
  return b;
}

/** Read-only session lookup — returns null for anonymous visitors. */
export async function currentBuilder(): Promise<Builder | null> {
  const id = await readBuilderId();
  if (!id) return null;
  const store = getBuilderStore();
  return store.getBuilder(id);
}
