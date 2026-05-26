"use client";

// /tierlist/[shortId] — error boundary for shared boards.

import { useEffect } from "react";
import Link from "next/link";

import { Icon } from "@/lib/icons";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TierlistShortError({ error, reset }: ErrorProps) {
  useEffect(() => {
    void import("@sentry/nextjs")
      .then((m) => m.captureException(error))
      .catch(() => {});
  }, [error]);

  return (
    <main className="home-surface tools-page tierlist-page">
      <section className="tier-error">
        <p className="tier-error-eyebrow">
          {"// ERROR · TIERLIST/[SHORTID]"}
        </p>
        <h1 className="tier-error-title">Something went wrong.</h1>
        <p className="tier-error-body">
          This shared board failed to render. Try again, or head home if it
          keeps erroring.
        </p>
        {error.digest && (
          <p className="tier-error-digest">
            {"// DIGEST: "}
            <span>{error.digest}</span>
          </p>
        )}
        <div className="tier-error-actions">
          <button
            type="button"
            onClick={reset}
            className="btn primary"
          >
            <Icon name="refresh" size="sm" />
            <span>Try again</span>
          </button>
          <Link href="/" className="btn ghost">
            <Icon name="arrow-left" size="sm" />
            <span>Back to home</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
