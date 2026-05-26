// Route-segment layout for `/repo/[owner]/[name]`.
//
// 2026-05-26: reverted to a passthrough so repo-profile pages use the GLOBAL
// app chrome — the shared Sidebar/Topbar/Ticker/Statusbar mounted in
// src/app/layout.tsx — i.e. the SAME left nav as every other route.
//
// Previously this layout replaced the global chrome with a custom
// RepoProfileSidebar + RepoProfileTopbar and suppressed the global sidebar via
// a route-scoped `:root:has([data-repo-profile-shell])` <style>. Per operator
// request ("use the normal sidebar on profiles"), that custom shell is removed.
// The page content (`.pf-main-inner`, max-width:1440, margin:0 auto) is
// self-contained, so it renders cleanly inside the global <main>.
//
// (RepoProfileSidebar / RepoProfileTopbar / repoProfileShell.module.css are now
// unused — left on disk for easy revert; safe to delete once this is final.)

export default function RepoProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
