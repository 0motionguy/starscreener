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
      <div
        className="v2-card overflow-hidden"
        style={{
          background: "rgba(255, 77, 77, 0.06)",
          borderColor: "var(--v2-sig-red)",
        }}
      >
        <div className="v2-term-bar">
          <span aria-hidden className="flex items-center gap-1.5">
            <span
              className="block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--v2-sig-red)" }}
            />
            <span
              className="block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--v2-line-200)" }}
            />
            <span
              className="block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--v2-line-200)" }}
            />
          </span>
          <span
            className="flex-1 truncate"
            style={{ color: "var(--v2-sig-red)" }}
          >
            {"// ERROR · RUNTIME"}
          </span>
        </div>
        <div className="p-6 md:p-8">
          <h1
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(28px, 4vw, 36px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            Something broke while rendering this surface.
          </h1>
          <p
            className="leading-relaxed mb-5"
            style={{ fontSize: 14, color: "var(--v2-ink-300)" }}
          >
            The firehose is still running — this is a client-side render
            fault, not stale data. Try refreshing the view; if it keeps
            erroring, the homepage usually survives.
          </p>
          {error.digest && (
            <p
              className="v2-mono mb-5"
              style={{ fontSize: 11, color: "var(--v2-ink-400)" }}
            >
              {"// DIGEST: "}
              <span style={{ color: "var(--v2-ink-300)" }}>{error.digest}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className={cn("v2-btn v2-btn-primary inline-flex")}
            >
              <RefreshCw className="h-4 w-4" style={{ marginRight: 8 }} />
              TRY AGAIN
            </button>
            <Link href="/" className="v2-btn v2-btn-ghost inline-flex">
              <Home className="h-4 w-4" style={{ marginRight: 8 }} />
              BACK TO HOME
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
