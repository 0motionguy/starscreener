/**
 * SidebarStream — async server component that performs the
 * `getPublicSidebarShell()` fan-out (13 data-store refresh hooks)
 * off the layout's critical path.
 *
 * Wrap in `<Suspense fallback={<SidebarSkeleton />}>` so the page body
 * streams first and the sidebar resolves later. Previously the await
 * sat in `RootLayout` itself, blocking every page's RSC stream on the
 * sidebar fetch (~4.2s cold TTFB observed in session-G perf snapshot).
 *
 * Failure mode is preserved: if the shell build throws (cold pipeline
 * / data-store hiccup), we pass `initialShell={null}` and the client
 * <Sidebar> falls back to its own fetch.
 */
import { Sidebar } from "@/components/layout/Sidebar";
import {
  getPublicSidebarShell,
  type SidebarShellResponse,
} from "@/lib/sidebar-data";

export async function SidebarStream() {
  let initialSidebarShell: SidebarShellResponse | null = null;
  try {
    initialSidebarShell = await getPublicSidebarShell({
      reposByIdTopN: 0,
      includeLegacyFacets: false,
    });
  } catch {
    initialSidebarShell = null;
  }
  return <Sidebar initialShell={initialSidebarShell} />;
}
