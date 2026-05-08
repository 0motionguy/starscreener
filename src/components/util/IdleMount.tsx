"use client";

// IdleMount — defers rendering of children until the browser is idle.
//
// Wrap eagerly-mounted but non-critical client components with this so they
// don't compete with first-paint or hydration of the visible chrome. The
// children render `null` on the server and during the initial hydration
// pass, then mount once `requestIdleCallback` fires (or after the timeout
// fallback for browsers without `requestIdleCallback`, e.g. Safari < 16.4).
//
// Used in the root layout to defer ClerkRefHandoff, BrowserAlertBridge, and
// GlobalShortcuts — all of them subscribe to global state but render nothing
// visible, so deferring their mount until idle has zero UX impact and frees
// the main thread during the first paint window.

import { useEffect, useState } from "react";

interface IdleMountProps {
  children: React.ReactNode;
  /**
   * Hard cap on idle wait (ms). The browser will fire even if it never
   * becomes idle. Default 2000ms strikes a balance between not delaying
   * cross-component handshakes and giving the first paint room to breathe.
   */
  timeout?: number;
}

type RequestIdleCallback = (
  cb: () => void,
  opts?: { timeout?: number },
) => number;
type CancelIdleCallback = (handle: number) => void;

export function IdleMount({ children, timeout = 2000 }: IdleMountProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // requestIdleCallback isn't in lib.dom.d.ts on every TS lib target,
    // so reach for it via the global scope and feature-detect at runtime.
    const ric = (globalThis as unknown as {
      requestIdleCallback?: RequestIdleCallback;
    }).requestIdleCallback;
    const cic = (globalThis as unknown as {
      cancelIdleCallback?: CancelIdleCallback;
    }).cancelIdleCallback;

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (typeof ric === "function") {
      idleHandle = ric(() => setMounted(true), { timeout });
    } else {
      timeoutHandle = setTimeout(() => setMounted(true), timeout);
    }

    return () => {
      if (idleHandle !== null && typeof cic === "function") {
        cic(idleHandle);
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
  }, [timeout]);

  return mounted ? <>{children}</> : null;
}
