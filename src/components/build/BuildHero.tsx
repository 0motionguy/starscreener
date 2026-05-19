// BuildHero — product header for /build with title + 2 CTAs.
//
// Server component (no client state). The "Connect GitHub" CTA links to the
// Clerk sign-in flow; on this surface the user is already signed in (Clerk
// gate happens in page.tsx), so this CTA actually re-asserts the Clerk
// GitHub social linkage. "Select repo" jumps to the in-page repo selector
// anchor since the cheap version of "select" is a dropdown inside the page.

import Link from "next/link";

interface BuildHeroProps {
  hasRepoSelected: boolean;
  selectedFullName: string | null;
}

export function BuildHero({ hasRepoSelected, selectedFullName }: BuildHeroProps) {
  return (
    <section className="product-header">
      <div className="product-title">
        <h1>Build</h1>
        <p>
          {hasRepoSelected && selectedFullName
            ? `Turn GitHub progress into public build updates for ${selectedFullName}.`
            : "Turn GitHub progress into public build updates."}
        </p>
      </div>
      <div className="header-actions">
        <Link className="btn primary" href="/sign-in?redirect_url=/build">
          Connect GitHub
        </Link>
        <Link className="btn" href="#repo-selector">
          Select repo
        </Link>
      </div>
    </section>
  );
}
