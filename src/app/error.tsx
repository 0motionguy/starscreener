"use client";

// Root-level error boundary. Catches unhandled throws in any route
// segment (most commonly: getDerivedRepos() failing, a bad data JSON
// parse, or a third-party lib blowing up on render). Must be a client
// component; Next.js injects `error` + `reset` props so we can show
// the cause and let the user retry without a full page refresh.

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to the browser console so devtools picks it up. Production
    // observability (Sentry/Logtail) can be wired on top of this later.
    console.error("[app/error] unhandled render error", error);
  }, [error]);

  return (
    <div className="max-w-[640px] mx-auto px-4 md:px-6 py-16 md:py-24">
      <div className="rounded-card border border-down/40 bg-down-bg/30 p-6 md:p-8">
        <span className="label-micro text-down">Error · runtime</span>
        <h1 className="font-display text-3xl md:text-4xl mt-2 mb-3 text-text-primary">
          Something broke while rendering this surface.
        </h1>
        <p className="text-text-secondary text-md leading-relaxed mb-5">
          The firehose is still running — this is a client-side render
          fault, not stale data. Try refreshing the view; if it keeps
          erroring, the homepage usually survives.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-text-muted mb-5">
            digest: <span className="text-text-tertiary">{error.digest}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-card",
              "border border-brand/60 px-3",
              "text-sm font-medium text-brand transition-colors",
              "hover:bg-brand hover:text-black hover:border-brand",
            )}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-card",
              "border border-border-primary bg-bg-secondary px-3",
              "text-sm font-medium text-text-secondary transition-colors",
              "hover:text-text-primary",
            )}
          >
            <Home className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
