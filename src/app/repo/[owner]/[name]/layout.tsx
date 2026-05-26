// Route-segment layout for `/repo/[owner]/[name]`.
//
// Replaces the global app shell (the .sidebar + .topbar mounted in
// src/app/layout.tsx) with the PF-modeled RepoProfileSidebar +
// RepoProfileTopbar — without touching the global shell.
//
// How the global chrome stays hidden on this route ONLY:
//   1. The route layout marks the rendered subtree with a data attribute
//      (`data-repo-profile-shell`) on the wrapper element.
//   2. An inline <style> tag (also emitted by this layout) uses a
//      `:root:has([data-repo-profile-shell])` selector to suppress the
//      global `.app > .sidebar` and `.app > .topbar` for this navigation.
//   3. The PF chrome inside this layout is positioned the same way as the
//      global chrome (sticky topbar, sidebar in a 2-col grid via the
//      module's `.shell` class) so visually it replaces the global chrome
//      pixel-for-pixel without overlap.
//
// All other routes are unaffected: the `:has()` selector is scoped by the
// presence of the data attribute which only ever appears under this
// segment. CSS-only solution — no JS to add/remove a body class, no
// route-aware logic in the global shell, no edits to layout.tsx.
//
// `relatedCount` derives from the existing data spine via
// `getRelatedReposFor` (same helper the page already uses). When the
// data store hasn't been hydrated yet the count is omitted gracefully.

import { Suspense } from "react";

import { refreshTrendingFromStore } from "@/lib/trending";
import { getRelatedReposFor } from "@/lib/repo-related";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

import { RepoProfileSidebar } from "@/components/repo/RepoProfileSidebar";
import { RepoProfileTopbar } from "@/components/repo/RepoProfileTopbar";

import styles from "@/components/repo/repoProfileShell.module.css";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ owner: string; name: string }>;
}

// Server-only "wrap the page in the PF shell" layout. No 'use client'.
export default async function RepoProfileLayout({
  children,
  params,
}: LayoutProps) {
  const { owner, name } = await params;
  const authEnabled = Boolean(getClerkPublishableKey());

  // Best-effort related count for the sidebar PROFILE group. Wrapped in
  // try/catch + ?? null so a cold data store never breaks the layout.
  let relatedCount: number | undefined;
  try {
    await refreshTrendingFromStore();
    const fullName = `${owner}/${name}`;
    const self =
      getDerivedRepoByFullName(fullName) ?? getDerivedRepoByFullName(fullName.toLowerCase());
    if (self) {
      relatedCount = getRelatedReposFor(self.id)?.length;
    }
  } catch {
    relatedCount = undefined;
  }

  return (
    <>
      {/* Route-scoped suppression of the global app shell. Lives inline so
          it travels with the route layout and is dropped on navigation.
          The global .app uses grid-template-areas with sidebar/topbar/
          ticker/main/status — we collapse it to a single area covering
          only main, so .ticker + .statusbar + .sidebar + .topbar all drop
          out cleanly on this route only. */}
      {/* Suppression is desktop-only. Below 900px the route-scoped sidebar
          collapses via repoProfileShell.module.css, so we restore the
          global sidebar + topbar to give mobile users a working nav. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media (min-width: 900px) {
  :root:has([data-repo-profile-shell]) .app > .sidebar,
  :root:has([data-repo-profile-shell]) .app > .topbar,
  :root:has([data-repo-profile-shell]) .app > .ticker,
  :root:has([data-repo-profile-shell]) .app > .statusbar { display: none !important; }
  :root:has([data-repo-profile-shell]) .app {
    grid-template-columns: 1fr !important;
    grid-template-rows: 1fr !important;
    grid-template-areas: "main" !important;
  }
  :root:has([data-repo-profile-shell]) .app > main.main {
    grid-area: main;
    padding: 0 !important;
  }
}
@media (max-width: 899.98px) {
  /* Hide the route-scoped PF topbar on mobile — the global topbar is
     restored above and provides nav. Avoids duplicate chrome. */
  :root:has([data-repo-profile-shell]) [data-repo-profile-shell] [data-repo-profile-topbar] {
    display: none !important;
  }
}
          `.trim(),
        }}
      />

      <div className={styles.shell} data-repo-profile-shell="true">
        {/* Server-rendered. Wrapped in Suspense so an undecided count
            doesn't block first paint. */}
        <Suspense fallback={<aside className={styles.sidebar} aria-busy="true" />}>
          <RepoProfileSidebar
            owner={owner}
            name={name}
            relatedCount={relatedCount}
          />
        </Suspense>
        <div className={styles.rhs}>
          <RepoProfileTopbar
            owner={owner}
            name={name}
            authEnabled={authEnabled}
          />
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </>
  );
}
