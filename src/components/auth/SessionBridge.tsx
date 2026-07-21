"use client";

// Keeps the ss_user cookie in lockstep with the Clerk session (the
// identity bridge, client half — the server half is /api/auth/session).
//
//   Signed in  → ensure the cookie carries `c_<clerkUserId>`; if the
//                browser still holds an anonymous (or stale/legacy)
//                identity, POST re-mints it as the Clerk-derived one.
//   Signed out → if the previous state in this tab was signed-in, DELETE
//                clears the cookie so the (potentially tier-carrying)
//                identity can't outlive the Clerk session.
//
// A GET probe runs first so the common case (cookie already correct) costs
// one cheap idempotent request and never burns the POST mint rate-limit.
// All failures are swallowed — the bridge is a convergence mechanism, not
// a gate; server routes re-verify identity on every request anyway.
//
// Mounted inside <ClerkProvider> in the root layout (requires its context).

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

import { clerkDerivedUserId } from "@/lib/auth/user-id";

export function SessionBridge(): null {
  const { isLoaded, userId } = useAuth();
  const lastSynced = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (lastSynced.current === userId) return;
    const previous = lastSynced.current;
    lastSynced.current = userId;

    let cancelled = false;

    (async () => {
      try {
        if (userId) {
          const expected = clerkDerivedUserId(userId);
          const probe = await fetch("/api/auth/session", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          const body = (await probe.json().catch(() => null)) as
            | { ok?: boolean; userId?: string }
            | null;
          if (cancelled) return;
          if (body?.ok === true && body.userId === expected) return;
          await fetch("/api/auth/session", {
            method: "POST",
            credentials: "include",
          });
        } else if (previous) {
          // Transitioned signed-in → signed-out in this tab. `keepalive` lets
          // the clear complete even if a Clerk redirect unmounts us mid-flight
          // (the race that used to leave the ss_user cookie behind). This is
          // convergence only — paid routes re-verify live Clerk server-side,
          // so a lingering cookie is inert for authorization either way.
          await fetch("/api/auth/session", {
            method: "DELETE",
            credentials: "include",
            keepalive: true,
          });
        }
      } catch {
        // Best-effort; see header comment.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId]);

  return null;
}

export default SessionBridge;
