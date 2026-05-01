"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DesignLabPrimitivesError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="max-w-[640px] mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
      <p
        className="v2-mono mb-3"
        style={{ fontSize: 11, color: "var(--v2-sig-red)" }}
      >
        {"// ERROR · DESIGN-LAB/PRIMITIVES"}
      </p>
      <h1
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: "clamp(24px, 3.5vw, 32px)",
          fontWeight: 510,
          letterSpacing: "-0.022em",
          color: "var(--v2-ink-000)",
          lineHeight: 1.1,
          marginBottom: 12,
        }}
      >
        Something went wrong.
      </h1>
      <p
        className="leading-relaxed mb-5"
        style={{ fontSize: 14, color: "var(--v2-ink-300)" }}
      >
        This surface failed to render. Try again, or head home if it keeps erroring.
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
      <div className="flex flex-wrap items-center justify-center gap-2">
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
  );
}
