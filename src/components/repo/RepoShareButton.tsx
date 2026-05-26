"use client";

// RepoShareButton — share/copy action for the /repo/[owner]/[name] hero.
//
// Behavior:
//   1. If the runtime exposes `navigator.share` (mobile + modern Safari/
//      Chrome), invoke the native share sheet. User-cancelled shares
//      throw AbortError; we silently swallow those.
//   2. Otherwise fall back to `navigator.clipboard.writeText(url)` and
//      pop the same toast bus the Compare button uses
//      (`window.TR?.showToast?.()`). Renders a transient copied-state
//      for ~1.5 s so the user gets visible confirmation in addition to
//      the toast.
//
// Pure client island — no backend, no analytics, no state persistence.

import { useCallback, useState } from "react";
import type { JSX } from "react";

import { Icon } from "@/components/icon/Icon";

interface RepoShareButtonProps {
  /** Canonical path of the current profile page, e.g. "/repo/vercel/next.js". */
  path: string;
  /** Title used for the native share sheet (e.g. repo fullName). */
  title: string;
}

const COPIED_FLASH_MS = 1500;

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

export function RepoShareButton({
  path,
  title,
}: RepoShareButtonProps): JSX.Element {
  const [copied, setCopied] = useState<boolean>(false);

  const handleClick = useCallback(async () => {
    // Resolve absolute URL from the live origin so we don't need to thread
    // NEXT_PUBLIC_SITE_URL or read request headers server-side.
    const url = new URL(path, window.location.origin).toString();

    // Prefer the native share sheet. `navigator.share` rejects with
    // AbortError when the user dismisses — that's not a failure mode
    // worth user-facing handling.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Some browsers reject with NotAllowedError on insecure contexts
        // or when called outside a user gesture; fall through to clipboard.
      }
    }

    // Clipboard fallback. `navigator.clipboard` may be undefined in
    // ancient or non-secure contexts; in that case we degrade to a
    // toast-only failure note.
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.TR?.showToast?.("Link copied");
        window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
      } else {
        window.TR?.showToast?.("Copy unsupported on this browser");
      }
    } catch {
      window.TR?.showToast?.("Copy failed");
    }
  }, [path, title]);

  return (
    <button
      type="button"
      className="btn ghost"
      title="Share or copy link"
      aria-label={copied ? "Link copied" : "Share or copy link"}
      onClick={handleClick}
    >
      <Icon name={copied ? "check" : "share"} size={13} />{" "}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
