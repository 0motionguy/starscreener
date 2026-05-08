"use client";

// ErrorPanel - branded error state for Next.js error boundaries.
// Replaces the default "Something went wrong" with actionable buttons:
// refresh (calls reset()), go home, and report-bug (deep-link to a
// GitHub issue with the error digest pre-filled). Used by both
// src/app/error.tsx and src/app/global-error.tsx.

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertOctagon, RefreshCw, Home, Bug } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: "default" | "compact";
}

const BTN_PRIMARY =
  "bg-accent text-bg-secondary hover:bg-accent-hover px-4 py-2 rounded";
const BTN_SECONDARY =
  "border border-border-primary text-text-secondary hover:bg-bg-tertiary px-4 py-2 rounded";

export function ErrorPanel({
  error,
  reset,
  variant = "default",
}: Props): ReactNode {
  const digest = error.digest;
  const isProd = process.env.NODE_ENV === "production";
  const isCompact = variant === "compact";
  const issueTitle = "Error: " + (digest ?? "unknown");
  const issueBody =
    "Error digest: " +
    (digest ?? "n/a") +
    "\nMessage: " +
    (error.message ?? "(no message)");
  const issueHref =
    "https://github.com/0motionguy/starscreener/issues/new?title=" +
    encodeURIComponent(issueTitle) +
    "&body=" +
    encodeURIComponent(issueBody);

  return (
    <main className="home-surface">
      <section
        className={
          "mx-auto " +
          (isCompact ? "my-6 max-w-lg p-5" : "my-12 max-w-2xl p-8") +
          " border border-dashed border-border-primary rounded-card text-center"
        }
      >
        <AlertOctagon
          className={
            (isCompact ? "h-8 w-8" : "h-12 w-12") + " mx-auto text-sig-red"
          }
          aria-hidden="true"
        />
        <h1
          className={
            "font-display font-bold mt-4 " +
            (isCompact ? "text-xl" : "text-2xl")
          }
        >
          Something went sideways
        </h1>
        <p className="text-text-secondary mt-2">
          The page hit an unexpected error. The team has been notified.
        </p>
        {digest && (
          <p className="text-text-tertiary text-xs font-mono mt-2">
            Error ID: {digest}
          </p>
        )}
        {!isProd && (error.stack || error.message) && (
          <pre className="mt-4 text-left text-xs bg-bg-tertiary rounded p-3 overflow-auto max-h-48">
            {error.stack ?? error.message}
          </pre>
        )}
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <button
            type="button"
            onClick={reset}
            className={BTN_PRIMARY + " inline-flex items-center gap-2"}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh page
          </button>
          <Link
            href="/"
            className={BTN_SECONDARY + " inline-flex items-center gap-2"}
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Go home
          </Link>
          <a
            href={issueHref}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_SECONDARY + " inline-flex items-center gap-2"}
          >
            <Bug className="h-4 w-4" aria-hidden="true" />
            Report bug
          </a>
        </div>
      </section>
    </main>
  );
}
