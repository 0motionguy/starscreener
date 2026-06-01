// Route-segment layout for `/repo/[owner]/[name]`.
//
// 2026-05-26: reverted to a passthrough so repo-profile pages use the GLOBAL
// app chrome — the shared Sidebar/Topbar/Ticker/Statusbar mounted in
// src/app/layout.tsx — i.e. the SAME left nav as every other route.
//
// Previously this layout replaced the global chrome with a custom route-scoped
// repo shell and suppressed the global sidebar via CSS. Per operator request
// ("use the normal sidebar on profiles"), that custom shell was removed.
// The page content (`.pf-main-inner`, max-width:1440, margin:0 auto) is
// self-contained, so it renders cleanly inside the global <main>.

export default function RepoProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
